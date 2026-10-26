import { basename, join, relative, sep } from "node:path";
import type { FocusTarget, SessionInput, SessionState } from "../shared/session.js";
import { hostApplication, listOpenFiles, type ProcessInfo } from "./processes.js";
import { SessionStore } from "./store.js";
import { EventCursor } from "./events.js";
import { SessionLifetimeGate, type LifetimeInspector } from "./lifetimes.js";

type Fields = Record<string, unknown>;

function fields(value: unknown): Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Fields : {};
}

function stringField(value: unknown, maximum = 240): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maximum) : undefined;
}

export class CopilotSessionState {
  state: SessionState = "unknown";
  ended = false;
  model?: string;
  project?: string;
  lastActivityAt?: string;
  lastTriggeredAt?: string;
  stateChangedAt?: string;
  stateEvent = "unobserved";
  readonly #permissions = new Set<string>();

  apply(value: unknown): void {
    const event = fields(value);
    const data = fields(event.data);
    const type = stringField(event.type);
    if (!type) return;
    const timestamp = stringField(event.timestamp);
    if (timestamp && Number.isFinite(Date.parse(timestamp))) this.lastActivityAt = new Date(timestamp).toISOString();
    if (["session.start", "session.resume", "user.message", "assistant.turn_start"].includes(type)) this.lastTriggeredAt = this.lastActivityAt;
    if (type === "session.start" || type === "session.resume") {
      this.project = stringField(fields(data.context).cwd) ?? this.project;
      this.model = stringField(data.selectedModel, 120) ?? this.model;
      this.#permissions.clear();
      this.#setState("starting", type);
    } else if (type === "session.model_change" || type === "session.auto_mode_resolved") {
      this.model = stringField(data.newModel ?? data.chosenModel, 120) ?? this.model;
    } else if (type === "permission.requested") {
      this.#permissions.add(stringField(data.requestId ?? event.id) ?? "permission");
      this.#setState("waiting", type);
    } else if (type === "permission.completed") {
      this.#permissions.delete(stringField(data.requestId) ?? "permission");
      this.#setState(this.#permissions.size ? "waiting" : "working", type);
    } else if (type === "session.shutdown") {
      this.#permissions.clear();
      this.#setState("done", type);
      this.ended = true;
    } else if (type === "session.error") {
      this.#setState("failed", type);
    } else if (["assistant.turn_end", "session.idle", "session.task_complete", "session.cancelled"].includes(type)) {
      this.#setState(this.#permissions.size ? "waiting" : "done", type);
    } else if (type === "tool.execution_start" && data.toolName === "ask_user") {
      this.#permissions.add(`input:${stringField(data.toolCallId) ?? "ask_user"}`);
      this.#setState("waiting", type);
    } else if (type === "tool.execution_complete" && this.#permissions.delete(`input:${stringField(data.toolCallId) ?? "ask_user"}`)) {
      this.#setState(this.#permissions.size ? "waiting" : "working", type);
    } else if (["user.message", "assistant.turn_start", "assistant.message", "tool.execution_start", "tool.execution_complete"].includes(type)) {
      if (type === "user.message") this.#permissions.clear();
      this.model = stringField(data.model, 120) ?? this.model;
      this.#setState(this.#permissions.size ? "waiting" : "working", type);
    }
  }

  #setState(state: SessionState, event: string): void {
    if (state !== this.state) this.stateChangedAt = this.lastActivityAt;
    this.state = state;
    this.ended = false;
    this.stateEvent = event;
  }
}

export interface CopilotOwner {
  sessionId: string;
  directory: string;
  pid: number;
  focusTarget?: FocusTarget;
}

export function copilotOwners(output: string, root: string, processes: ProcessInfo[]): CopilotOwner[] {
  let pid = 0;
  const owners = new Map<string, CopilotOwner>();
  for (const line of output.split("\n")) {
    if (line.startsWith("p")) pid = Number(line.slice(1));
    if (!line.startsWith("n") || !pid) continue;
    const path = line.slice(1);
    const match = relative(root, path).split(sep).join("/").match(/^([\w-]+)\/inuse\.(\d+)\.hold$/);
    if (!match || Number(match[2]) !== pid) continue;
    owners.set(match[1], { sessionId: match[1], directory: join(root, match[1]), pid, focusTarget: hostApplication(pid, processes) });
  }
  return [...owners.values()];
}

export class CopilotTracker {
  readonly #cursors = new Map<string, EventCursor<CopilotSessionState>>();
  readonly #tracked = new Set<string>();
  readonly #lifetimes = new SessionLifetimeGate();

  constructor(private readonly store: SessionStore, private readonly root: string) {}

  async scan(processes: ProcessInfo[], lifetimes?: LifetimeInspector): Promise<void> {
    const candidates = processes.filter((process) => /(?:^|\/)(?:copilot|copilot-runtime)(?:$|\s)/.test(process.name));
    const output = await listOpenFiles(candidates.map((process) => process.pid));
    await this.reconcile(copilotOwners(output, this.root, processes), lifetimes);
  }

  async reconcile(owners: CopilotOwner[], lifetimes?: LifetimeInspector): Promise<void> {
    const present = new Set(owners.map((owner) => `copilot:${owner.sessionId}`));
    for (const owner of owners) {
      const id = `copilot:${owner.sessionId}`;
      const cursor = this.#cursors.get(id) ?? new EventCursor(() => new CopilotSessionState());
      this.#cursors.set(id, cursor);
      const path = join(owner.directory, "events.jsonl");
      let available = false;
      let errorCode: string | undefined;
      try {
        await cursor.read(path);
        available = true;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        errorCode = typeof code === "string" ? code.slice(0, 40) : "READ_FAILED";
      }
      const observed = cursor.state;
      const lifetime = await lifetimes?.(owner, observed.project) ?? { status: "unverified", evidence: "Runtime ownership only" };
      if (!this.#lifetimes.visible(id, lifetime, observed.lastTriggeredAt)) {
        this.store.remove(id);
        this.#tracked.delete(id);
        cursor.signature = "";
        continue;
      }
      const input: SessionInput = {
        id,
        source: "copilot-local",
        harness: owner.focusTarget?.appName?.includes("IntelliJ") ? "copilot-ide" : "copilot-cli",
        label: `${observed.project ? basename(observed.project) : "Copilot"} · ${owner.sessionId.slice(0, 6)}`,
        state: available ? observed.state : "unknown",
        ended: available ? observed.ended : false,
        model: observed.model,
        project: observed.project,
        focusTarget: owner.focusTarget,
        metadata: {
          sessionId: owner.sessionId,
          host: owner.focusTarget?.appName ?? "CLI",
          ownerPid: String(owner.pid),
          tracking: "copilot-events",
          hostLifetime: lifetime.status,
          hostEvidence: lifetime.evidence,
          ...(lifetime.openedAt ? { projectOpenedAt: new Date(lifetime.openedAt).toISOString() } : {}),
          ...(observed.lastTriggeredAt ? { lastTriggeredAt: observed.lastTriggeredAt } : {}),
          stateEvent: available ? observed.stateEvent : "events.unavailable",
          telemetryStatus: errorCode === "ENOENT" ? "missing" : !available ? "unreadable" : observed.state === "unknown" ? "unrecognized" : "available",
          telemetryLocation: path.slice(0, 240),
          ...(errorCode ? { telemetryError: errorCode } : {}),
          ...(observed.lastActivityAt ? { lastTelemetryAt: observed.lastActivityAt } : {}),
        },
      };
      const signature = JSON.stringify([input, observed.lastActivityAt, observed.stateChangedAt]);
      if (cursor.signature !== signature) {
        const transitionAt = available ? observed.stateChangedAt : this.store.get(id)?.state !== "unknown" ? new Date().toISOString() : undefined;
        this.store.upsert(input, observed.lastActivityAt, transitionAt);
        cursor.signature = signature;
      }
      this.#tracked.add(id);
    }
    for (const id of this.#tracked) {
      if (present.has(id)) continue;
      this.store.end(id);
      this.#tracked.delete(id);
      this.#cursors.delete(id);
    }
    for (const id of this.#cursors.keys()) {
      if (present.has(id)) continue;
      this.#cursors.delete(id);
      this.#lifetimes.forget(id);
    }
  }

  unavailable(): void {
    for (const id of this.#tracked) {
      const session = this.store.get(id);
      if (session && !session.ended && session.state !== "unknown") {
        this.store.upsert({ ...session, state: "unknown", metadata: { ...session.metadata, stateEvent: "discovery.unavailable", telemetryStatus: "discovery-unavailable" } }, session.lastActivityAt, new Date().toISOString());
      }
      const cursor = this.#cursors.get(id);
      if (cursor) cursor.signature = "";
    }
  }
}
