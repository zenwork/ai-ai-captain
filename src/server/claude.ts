import { readFile, readdir, stat } from "node:fs/promises";
import { basename, isAbsolute, join } from "node:path";
import { z } from "zod";
import type { SessionInput, SessionState } from "../shared/session.js";
import { SessionLifetimeGate, type LifetimeInspector } from "./lifetimes.js";
import { hostApplication, type ProcessInfo } from "./processes.js";
import { SessionStore } from "./store.js";

const maximumRegistrationBytes = 64 * 1024;
const processStartToleranceMilliseconds = 1000;
const registrationSchema = z.object({
  pid: z.number().int().positive(),
  sessionId: z.string().uuid().toLowerCase(),
  cwd: z.string().max(240).refine(isAbsolute),
  startedAt: z.number().positive().refine((value) => Number.isFinite(new Date(value).getTime())),
  procStart: z.string().max(80).optional(),
  pidDomain: z.string().optional(),
  status: z.string().max(80).optional(),
  statusUpdatedAt: z.number().positive().optional(),
  model: z.string().max(120).optional(),
});
type Registration = z.infer<typeof registrationSchema>;

export function claudeRegistryState(status: string | undefined): SessionState {
  if (status === "busy" || status === "running" || status === "working") return "working";
  if (status === "waiting" || status === "needs_input" || status === "permission_required") return "waiting";
  if (status === "idle" || status === "done") return "done";
  if (status === "starting") return "starting";
  if (status === "failed" || status === "error") return "failed";
  return "unknown";
}

function ownsRegistration(registration: Registration, process: ProcessInfo, fileName: string): boolean {
  if (registration.pid !== process.pid || fileName !== `${process.pid}.json`) return false;
  if (!/(?:^|\/)claude$/.test(process.name)) return false;
  if (registration.pidDomain && registration.pidDomain !== "darwin") return false;
  if (!process.startedAt) return false;
  const processStartedAt = Date.parse(process.startedAt);
  if (!Number.isFinite(processStartedAt) || registration.startedAt + processStartToleranceMilliseconds < processStartedAt) return false;
  if (!registration.procStart) return true;
  const processStartText = /^\w{3} \w{3}\s+\d+ \d{2}:\d{2}:\d{2} \d{4}$/.test(registration.procStart)
    ? `${registration.procStart} UTC` : registration.procStart;
  const registeredProcessStart = Date.parse(processStartText);
  return Number.isFinite(registeredProcessStart) && Math.abs(registeredProcessStart - processStartedAt) <= processStartToleranceMilliseconds;
}

export class ClaudeTracker {
  readonly #tracked = new Map<string, number>();
  readonly #signatures = new Map<string, string>();
  readonly #triggers = new Map<string, string>();
  readonly #lifetimes = new SessionLifetimeGate();

  constructor(private readonly store: SessionStore, private readonly root: string) {}

  async scan(processes: ProcessInfo[], lifetimes?: LifetimeInspector): Promise<void> {
    const directory = join(this.root, "sessions");
    const names = await readdir(directory).catch((error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
      throw error;
    });
    const present = new Set<string>();
    const uncertainProcesses = new Set<number>();
    for (const name of names) {
      const match = name.match(/^(\d+)\.json$/);
      if (!match) continue;
      const process = processes.find((candidate) => candidate.pid === Number(match[1]));
      if (!process || !/(?:^|\/)claude$/.test(process.name)) continue;
      const location = join(directory, name);
      try {
        if ((await stat(location)).size > maximumRegistrationBytes) throw new Error("REGISTRATION_SIZE");
        const registration = registrationSchema.parse(JSON.parse(await readFile(location, "utf8")));
        if (!ownsRegistration(registration, process, name)) continue;
        const identifier = `claude:${registration.sessionId}`;
        present.add(identifier);
        const focusTarget = hostApplication(process.pid, processes);
        const owner = { pid: process.pid, focusTarget };
        const lifetime = await lifetimes?.(owner, registration.cwd) ?? { status: "unverified", evidence: "Live Claude registration" };
        const state = claudeRegistryState(registration.status);
        const statusTimestamp = registration.statusUpdatedAt;
        const observedAt = statusTimestamp && Number.isFinite(new Date(statusTimestamp).getTime()) && statusTimestamp >= registration.startedAt
          ? statusTimestamp : registration.startedAt;
        const timestamp = new Date(observedAt).toISOString();
        const previousTrigger = this.#triggers.get(identifier);
        const latestTrigger = new Date(state === "working" || state === "starting" ? observedAt : registration.startedAt).toISOString();
        const triggeredAt = previousTrigger && previousTrigger > latestTrigger ? previousTrigger : latestTrigger;
        this.#triggers.set(identifier, triggeredAt);
        if (!this.#lifetimes.visible(identifier, lifetime, triggeredAt)) {
          this.store.remove(identifier);
          this.#tracked.delete(identifier);
          this.#signatures.delete(identifier);
          continue;
        }
        const host = focusTarget?.appName ?? "CLI";
        const harness = /intellij/i.test(host) ? "claude-ide" : host === "Claude" ? "claude-app" : "claude-cli";
        const input: SessionInput = {
          id: identifier,
          source: "claude-local",
          harness,
          label: `${basename(registration.cwd) || "Claude Code"} · ${registration.sessionId.slice(-6)}`,
          state,
          ended: false,
          model: registration.model,
          project: registration.cwd,
          focusTarget,
          metadata: {
            sessionId: registration.sessionId,
            host,
            ownerPid: String(process.pid),
            tracking: "claude-registry",
            stateEvent: state === "unknown" ? "registry.unrecognized" : `registry.${state}`,
            telemetryStatus: state === "unknown" ? "unrecognized" : "available",
            telemetryLocation: location.slice(0, 240),
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
        this.#tracked.set(identifier, process.pid);
      } catch {
        uncertainProcesses.add(process.pid);
      }
    }
    for (const [identifier, processIdentifier] of this.#tracked) {
      if (present.has(identifier)) continue;
      if (uncertainProcesses.has(processIdentifier)) {
        this.#unavailable(identifier, "REGISTRATION_UNREADABLE");
        continue;
      }
      this.store.remove(identifier);
      this.#tracked.delete(identifier);
      this.#signatures.delete(identifier);
      this.#triggers.delete(identifier);
      this.#lifetimes.forget(identifier);
    }
    for (const identifier of this.#triggers.keys()) {
      if (present.has(identifier) || this.#tracked.has(identifier)) continue;
      this.#triggers.delete(identifier);
      this.#lifetimes.forget(identifier);
    }
  }

  unavailable(): void {
    for (const identifier of this.#tracked.keys()) this.#unavailable(identifier, "DISCOVERY_UNAVAILABLE");
  }

  #unavailable(identifier: string, errorCode: string): void {
    const session = this.store.get(identifier);
    if (session?.state !== "unknown" && session) {
      this.store.upsert({ ...session, state: "unknown", metadata: { ...session.metadata, stateEvent: "registry.unavailable", telemetryStatus: "unreadable", telemetryError: errorCode } }, session.lastActivityAt, new Date().toISOString());
    }
    this.#signatures.delete(identifier);
  }
}
