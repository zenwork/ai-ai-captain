import { readdir } from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";
import type { FocusTarget, SessionApproval, SessionFreedom, SessionInput, SessionState } from "../shared/session.js";
import { EventCursor } from "./events.js";
import { hostApplication, listOpenFiles, type ProcessInfo } from "./processes.js";
import { SessionStore } from "./store.js";
import { SessionLifetimeGate, type LifetimeInspector } from "./lifetimes.js";

function fields(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringField(value: unknown, maximum = 240): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maximum) : undefined;
}

function wholeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;
}

const fullAccessSandbox = "danger-full-access";
const neverAskPolicy = "never";

const sessionIdPattern = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const lockPattern = new RegExp(`^thread-writer-locks/(${sessionIdPattern})\\.lock$`, "i");
const rolloutPattern = new RegExp(`^rollout-.+-(${sessionIdPattern})\\.jsonl$`, "i");

export class CodexSessionState {
  state: SessionState = "unknown";
  model?: string;
  tokensUsed?: number;
  contextUsedPercent?: number;
  freedom?: SessionFreedom;
  approval?: SessionApproval;
  project?: string;
  lastActivityAt?: string;
  lastTriggeredAt?: string;
  stateChangedAt?: string;
  stateEvent = "unobserved";
  #turnId?: string;
  readonly #requests = new Set<string>();

  apply(value: unknown): void {
    const event = fields(value);
    const payload = fields(event.payload);
    const timestamp = stringField(event.timestamp);
    if (timestamp && Number.isFinite(Date.parse(timestamp))) this.lastActivityAt = new Date(timestamp).toISOString();
    if (event.type === "session_meta" || event.type === "turn_context") {
      this.project = stringField(payload.cwd) ?? this.project;
      this.model = stringField(payload.model, 120) ?? this.model;
      if (event.type === "turn_context") this.#applyModes(payload);
      if (event.type === "session_meta") {
        this.lastTriggeredAt = this.lastActivityAt;
        this.#setState("starting", "session_meta");
      }
      return;
    }
    if (event.type === "response_item") {
      const callId = stringField(payload.call_id);
      if (callId && ["function_call", "custom_tool_call"].includes(String(payload.type)) && /^(?:functions\.)?request_user_input$/.test(String(payload.name))) {
        this.#requests.add(callId);
        this.#setState("waiting", "request_user_input");
      } else if (callId && ["function_call_output", "custom_tool_call_output"].includes(String(payload.type)) && this.#requests.delete(callId)) {
        this.#setState(this.#requests.size ? "waiting" : "working", "request_user_input.completed");
      }
      return;
    }
    if (event.type !== "event_msg") return;
    const type = stringField(payload.type);
    if (!type) return;
    if (type === "token_count") {
      this.#applyTokenUsage(fields(payload.info));
    } else if (type === "thread_settings_applied") {
      const settings = fields(payload.thread_settings);
      this.model = stringField(settings.model, 120) ?? this.model;
      this.project = stringField(settings.cwd) ?? this.project;
    } else if (type === "task_started" || type === "turn_started") {
      this.lastTriggeredAt = this.lastActivityAt;
      this.#turnId = stringField(payload.turn_id);
      this.#requests.clear();
      this.#setState("working", type);
    } else if (["task_complete", "turn_complete", "turn_completed", "turn_aborted"].includes(type)) {
      const turnId = stringField(payload.turn_id);
      if (this.#turnId && turnId && turnId !== this.#turnId) return;
      this.#requests.clear();
      this.#setState("done", type);
    } else if (type === "error" || type === "turn_failed") {
      this.#setState("failed", type);
    }
  }

  // Read only the mode names. Never keep sandbox paths or commands.
  #applyModes(payload: Record<string, unknown>): void {
    const sandbox = payload.sandbox_policy;
    const sandboxType = typeof sandbox === "string" ? sandbox : stringField(fields(sandbox).type);
    if (sandboxType) this.freedom = sandboxType === fullAccessSandbox ? "full" : "limited";
    const policy = stringField(payload.approval_policy);
    if (policy) this.approval = policy === neverAskPolicy ? "never" : "asks";
  }

  #applyTokenUsage(info: Record<string, unknown>): void {
    const total = wholeNumber(fields(info.total_token_usage).total_tokens);
    if (total !== undefined) this.tokensUsed = total;
    const contextTokens = wholeNumber(fields(info.last_token_usage).total_tokens);
    const contextWindow = wholeNumber(info.model_context_window);
    if (contextTokens === undefined || !contextWindow) return;
    this.contextUsedPercent = Math.min(100, Math.round((contextTokens / contextWindow) * 100));
  }

  #setState(state: SessionState, event: string): void {
    if (state !== this.state) this.stateChangedAt = this.lastActivityAt;
    this.state = state;
    this.stateEvent = event;
  }
}

export interface CodexOwner {
  sessionId: string;
  rolloutPath?: string;
  pid: number;
  focusTarget?: FocusTarget;
}

export function codexOwners(output: string, root: string, processes: ProcessInfo[]): CodexOwner[] {
  let pid = 0;
  const owners = new Map<string, CodexOwner>();
  const rollouts = new Map<string, CodexOwner>();
  for (const line of output.split("\n")) {
    if (line.startsWith("p")) pid = Number(line.slice(1));
    if (!line.startsWith("n") || !processes.some((process) => process.pid === pid)) continue;
    const path = line.slice(1);
    const local = relative(root, path).split(sep).join("/");
    const lock = local.match(lockPattern);
    if (lock) owners.set(lock[1], { sessionId: lock[1], pid, focusTarget: hostApplication(pid, processes) });
    if (!local.startsWith("sessions/")) continue;
    const rollout = basename(path).match(rolloutPattern);
    if (rollout) rollouts.set(rollout[1], { sessionId: rollout[1], rolloutPath: path, pid, focusTarget: hostApplication(pid, processes) });
  }
  for (const [sessionId, rollout] of rollouts) {
    const owner = owners.get(sessionId);
    if (!owner || owner.pid === rollout.pid) owners.set(sessionId, { ...owner, ...rollout });
  }
  return [...owners.values()];
}

export class CodexTracker {
  readonly #cursors = new Map<string, EventCursor<CodexSessionState>>();
  readonly #rollouts = new Map<string, string>();
  readonly #tracked = new Set<string>();
  readonly #lifetimes = new SessionLifetimeGate();
  #nextIndexAt = 0;
  #indexError?: string;

  constructor(private readonly store: SessionStore, private readonly root: string) {}

  async scan(processes: ProcessInfo[], lifetimes?: LifetimeInspector): Promise<void> {
    const candidates = processes.filter((process) => /(?:^|\/)codex$/.test(process.name));
    const output = await listOpenFiles(candidates.map((process) => process.pid));
    await this.reconcile(codexOwners(output, this.root, processes), lifetimes);
  }

  async reconcile(owners: CodexOwner[], lifetimes?: LifetimeInspector): Promise<void> {
    for (const owner of owners) if (owner.rolloutPath) this.#rollouts.set(owner.sessionId, owner.rolloutPath);
    if (owners.some((owner) => !this.#rollouts.has(owner.sessionId)) && Date.now() >= this.#nextIndexAt) {
      this.#nextIndexAt = Date.now() + 30_000;
      this.#indexError = undefined;
      const entries = await readdir(join(this.root, "sessions"), { recursive: true, withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
        this.#indexError = typeof error.code === "string" ? error.code.slice(0, 40) : "READ_FAILED";
        return [];
      });
      for (const entry of entries) {
        const match = entry.isFile() && entry.name.match(rolloutPattern);
        if (match) this.#rollouts.set(match[1], join(entry.parentPath, entry.name));
      }
    }
    const present = new Set(owners.map((owner) => `codex:${owner.sessionId}`));
    for (const owner of owners) {
      const id = `codex:${owner.sessionId}`;
      const cursor = this.#cursors.get(id) ?? new EventCursor(() => new CodexSessionState());
      this.#cursors.set(id, cursor);
      const path = this.#rollouts.get(owner.sessionId);
      let available = false;
      let errorCode = path ? undefined : this.#indexError;
      if (path) {
        try { await cursor.read(path); available = true; } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          errorCode = typeof code === "string" ? code.slice(0, 40) : "READ_FAILED";
        }
      }
      const observed = cursor.state;
      const lifetime = await lifetimes?.(owner, observed.project) ?? { status: "unverified", evidence: "Runtime ownership only" };
      if (!this.#lifetimes.visible(id, lifetime, observed.lastTriggeredAt)) {
        this.store.remove(id);
        this.#tracked.delete(id);
        cursor.signature = "";
        continue;
      }
      const hostName = owner.focusTarget?.appName ?? "";
      const inIde = /intellij/i.test(hostName);
      const inDesktopApp = /^(?:ChatGPT|Codex)$/i.test(hostName);
      const input: SessionInput = {
        id,
        source: "codex-local",
        harness: inIde ? "codex-ide" : inDesktopApp ? "codex-app" : "codex-cli",
        label: `${observed.project ? basename(observed.project) : "Codex"} · ${owner.sessionId.slice(-6)}`,
        state: available ? observed.state : "unknown",
        ended: false,
        model: observed.model,
        tokensUsed: observed.tokensUsed,
        contextUsedPercent: observed.contextUsedPercent,
        freedom: observed.freedom,
        approval: observed.approval,
        project: observed.project,
        focusTarget: owner.focusTarget,
        metadata: {
          sessionId: owner.sessionId,
          host: owner.focusTarget?.appName ?? "CLI",
          ownerPid: String(owner.pid),
          tracking: "codex-events",
          hostLifetime: lifetime.status,
          hostEvidence: lifetime.evidence,
          ...(lifetime.openedAt ? { projectOpenedAt: new Date(lifetime.openedAt).toISOString() } : {}),
          ...(observed.lastTriggeredAt ? { lastTriggeredAt: observed.lastTriggeredAt } : {}),
          stateEvent: available ? observed.stateEvent : "events.unavailable",
          telemetryStatus: errorCode === "ENOENT" || !path && !errorCode ? "missing" : !available ? "unreadable" : observed.state === "unknown" ? "unrecognized" : "available",
          telemetryLocation: (path ?? join(this.root, "sessions")).slice(0, 240),
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
      if (session && session.state !== "unknown") {
        this.store.upsert({ ...session, state: "unknown", metadata: { ...session.metadata, stateEvent: "discovery.unavailable", telemetryStatus: "discovery-unavailable" } }, session.lastActivityAt, new Date().toISOString());
      }
      const cursor = this.#cursors.get(id);
      if (cursor) cursor.signature = "";
    }
  }
}
