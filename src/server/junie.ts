import { open, readFile, stat } from "node:fs/promises";
import { basename, isAbsolute, join } from "node:path";
import { z } from "zod";
import type { SessionApproval, SessionFreedom, SessionInput, SessionState } from "../shared/session.js";
import { SessionLifetimeGate, type HostLifetime, type LifetimeInspector } from "./lifetimes.js";
import { hostApplication, type ProcessInfo } from "./processes.js";
import { SessionStore } from "./store.js";

const maximumIndexBytes = 4 * 1024 * 1024;
const eventTailBytes = 256 * 1024;
const maximumInspectedSessions = 20;
const maximumSessionAgeMilliseconds = 24 * 60 * 60 * 1000;
const ideProcessPattern = /\/IntelliJ IDEA[^/]*\.app\/Contents\/MacOS\/idea$/;
const stateEventPattern = /"state":"([A-Z_]+)","agentEvent"/g;
const contextReportPattern = /"kind":"ContextWindowReportEvent"[^\n]*?"percentage":([\d.]+),"used":(\d+)/g;
const junieSettingsSchema = z.object({
  model: z.object({ modelId: z.string().trim().min(1).max(120) }).optional(),
  braveMode: z.string().optional(),
});
const indexEntrySchema = z.object({
  sessionId: z.string().regex(/^session-[\w-]{1,80}$/),
  createdAt: z.number().positive(),
  updatedAt: z.number().positive(),
  projectDir: z.string().max(240).refine(isAbsolute),
});
type IndexEntry = z.infer<typeof indexEntrySchema>;

export function junieEventState(status: string | undefined): SessionState {
  if (status === "IN_PROGRESS") return "working";
  if (status === "COMPLETED") return "done";
  if (status === "FAILED") return "failed";
  return "unknown";
}

export function lastJunieStatus(tail: string): string | undefined {
  let latest: string | undefined;
  for (const match of tail.matchAll(stateEventPattern)) latest = match[1];
  return latest;
}

export function lastJunieContext(tail: string): { contextUsedPercent: number; tokensUsed: number } | undefined {
  let latest: { contextUsedPercent: number; tokensUsed: number } | undefined;
  for (const match of tail.matchAll(contextReportPattern)) {
    const percentage = Number(match[1]);
    const used = Number(match[2]);
    if (!Number.isFinite(percentage) || !Number.isFinite(used)) continue;
    latest = { contextUsedPercent: Math.min(100, Math.max(0, Math.round(percentage))), tokensUsed: used };
  }
  return latest;
}

export function parseJunieSettings(content: string): { model?: string; freedom?: SessionFreedom; approval?: SessionApproval } {
  try {
    const parsed = junieSettingsSchema.safeParse(JSON.parse(content));
    if (!parsed.success) return {};
    const brave = parsed.data.braveMode?.toUpperCase();
    // Brave mode lets Junie act without asking, so it maps to full freedom and AUTO.
    if (brave === "ON") return { model: parsed.data.model?.modelId, freedom: "full", approval: "never" };
    if (brave === "OFF") return { model: parsed.data.model?.modelId, freedom: "limited", approval: "asks" };
    return { model: parsed.data.model?.modelId };
  } catch {
    return {};
  }
}

async function readJunieSettings(directory: string): Promise<ReturnType<typeof parseJunieSettings>> {
  try {
    return parseJunieSettings(await readFile(join(directory, "settings.json"), "utf8"));
  } catch {
    return {};
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export class JunieTracker {
  readonly #tracked = new Set<string>();
  readonly #signatures = new Map<string, string>();
  readonly #triggers = new Map<string, string>();
  readonly #lifetimes = new SessionLifetimeGate();

  constructor(private readonly store: SessionStore, private readonly root: string) {}

  async scan(processes: ProcessInfo[], lifetimes?: LifetimeInspector): Promise<void> {
    const entries = await this.#readIndex();
    const present = new Set<string>();
    const hosts = processes.filter((process) => ideProcessPattern.test(process.name));
    for (const entry of entries) {
      const identifier = `junie:${entry.sessionId}`;
      const directory = join(this.root, entry.sessionId);
      const events = await this.#readEvents(directory);
      if (!events) continue;
      const project = await this.#projectLifetime(entry, hosts, processes, lifetimes);
      const lifetime = project.lifetime;
      const state = junieEventState(events.status);
      const settings = await readJunieSettings(directory);
      const activityAt = Math.max(entry.updatedAt, events.modifiedAt);
      const previousTrigger = this.#triggers.get(identifier);
      const latestTrigger = new Date(state === "working" ? activityAt : entry.createdAt).toISOString();
      const triggeredAt = previousTrigger && previousTrigger > latestTrigger ? previousTrigger : latestTrigger;
      this.#triggers.set(identifier, triggeredAt);
      present.add(identifier);
      if (!this.#lifetimes.visible(identifier, lifetime, triggeredAt)) {
        this.#remove(identifier);
        continue;
      }
      const timestamp = new Date(activityAt).toISOString();
      const input: SessionInput = {
        id: identifier,
        source: "junie-local",
        harness: "intellij-ai",
        model: settings.model,
        tokensUsed: events.context?.tokensUsed,
        contextUsedPercent: events.context?.contextUsedPercent,
        freedom: settings.freedom,
        approval: settings.approval,
        label: `${basename(entry.projectDir) || "Junie"} · ${entry.sessionId.slice(-4)}`,
        state,
        ended: false,
        project: entry.projectDir,
        focusTarget: project.focusTarget,
        metadata: {
          sessionId: entry.sessionId,
          host: "IntelliJ IDEA",
          tracking: "junie-session-files",
          stateEvent: state === "unknown" ? "junie.unrecognized" : `junie.${state}`,
          telemetryStatus: state === "unknown" ? "unrecognized" : "available",
          telemetryLocation: directory.slice(0, 240),
          lastTelemetryAt: timestamp,
          lastTriggeredAt: triggeredAt,
          hostLifetime: lifetime.status,
          hostEvidence: lifetime.evidence,
          ...(lifetime.openedAt ? { projectOpenedAt: new Date(lifetime.openedAt).toISOString() } : {}),
        },
      };
      const signature = JSON.stringify(input);
      if (this.#signatures.get(identifier) !== signature) {
        this.store.upsert(input, timestamp, timestamp);
        this.#signatures.set(identifier, signature);
      }
      this.#tracked.add(identifier);
    }
    for (const identifier of [...this.#tracked]) {
      if (!present.has(identifier)) this.#remove(identifier);
    }
    for (const identifier of this.#triggers.keys()) {
      if (present.has(identifier)) continue;
      this.#triggers.delete(identifier);
      this.#lifetimes.forget(identifier);
    }
  }

  unavailable(): void {
    for (const identifier of this.#tracked) {
      const session = this.store.get(identifier);
      if (session && session.state !== "unknown") {
        this.store.upsert({ ...session, state: "unknown", metadata: { ...session.metadata, stateEvent: "junie.unavailable", telemetryStatus: "unreadable", telemetryError: "DISCOVERY_UNAVAILABLE" } }, session.lastActivityAt, new Date().toISOString());
      }
      this.#signatures.delete(identifier);
    }
  }

  #remove(identifier: string): void {
    this.store.remove(identifier);
    this.#tracked.delete(identifier);
    this.#signatures.delete(identifier);
  }

  async #readIndex(): Promise<IndexEntry[]> {
    const location = join(this.root, "index.jsonl");
    try {
      if ((await stat(location)).size > maximumIndexBytes) throw new Error("INDEX_SIZE");
      const content = await readFile(location, "utf8");
      const entries: IndexEntry[] = [];
      for (const line of content.split("\n")) {
        if (!line.trim()) continue;
        try {
          const parsed = indexEntrySchema.safeParse(JSON.parse(line));
          if (parsed.success && Date.now() - parsed.data.updatedAt <= maximumSessionAgeMilliseconds) entries.push(parsed.data);
        } catch {
          continue;
        }
      }
      return entries.sort((left, right) => right.updatedAt - left.updatedAt).slice(0, maximumInspectedSessions);
    } catch (error) {
      if (isMissingFile(error)) return [];
      throw error;
    }
  }

  async #readEvents(directory: string): Promise<{ status: string | undefined; modifiedAt: number; context: ReturnType<typeof lastJunieContext> } | undefined> {
    try {
      const handle = await open(join(directory, "events.jsonl"), "r");
      try {
        const { size, mtimeMs } = await handle.stat();
        const length = Math.min(size, eventTailBytes);
        const buffer = Buffer.alloc(length);
        await handle.read(buffer, 0, length, size - length);
        const tail = buffer.toString("utf8");
        return { status: lastJunieStatus(tail), modifiedAt: mtimeMs, context: lastJunieContext(tail) };
      } finally {
        await handle.close();
      }
    } catch (error) {
      if (isMissingFile(error)) return undefined;
      throw error;
    }
  }

  async #projectLifetime(entry: IndexEntry, hosts: ProcessInfo[], processes: ProcessInfo[], lifetimes?: LifetimeInspector): Promise<{ lifetime: HostLifetime; focusTarget?: ReturnType<typeof hostApplication> }> {
    if (!lifetimes) {
      return {
        lifetime: { status: "unverified", evidence: "Junie session files" },
        focusTarget: hosts[0] ? hostApplication(hosts[0].pid, processes) : undefined,
      };
    }
    if (hosts.length === 0) return { lifetime: { status: "closed", evidence: "IntelliJ IDEA not running" } };
    let fallback: HostLifetime | undefined;
    let fallbackFocusTarget: ReturnType<typeof hostApplication>;
    for (const host of hosts) {
      const focusTarget = hostApplication(host.pid, processes);
      const lifetime = await lifetimes({ pid: host.pid, focusTarget }, entry.projectDir);
      if (lifetime.status === "open") return { lifetime, focusTarget };
      if (!fallback || lifetime.status === "unverified") {
        fallback = lifetime;
        fallbackFocusTarget = focusTarget;
      }
    }
    return {
      lifetime: fallback ?? { status: "unverified", evidence: "Junie session files" },
      focusTarget: fallbackFocusTarget,
    };
  }
}
