import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { EventEmitter } from "node:events";
import { dismissableStates, sessionSchema, type HubEvent, type Session, type SessionInput } from "../shared/session.js";

const terminalStates = new Set(["done", "failed"]);
const terminalLifetimeMs = 10_000;

export class SessionStore {
  readonly #events = new EventEmitter();
  readonly #sessions = new Map<string, Session>();
  readonly #restored = new Set<string>();
  readonly #expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  #persistQueue = Promise.resolve();

  constructor(private readonly persistencePath?: string) {}

  async load(): Promise<void> {
    if (!this.persistencePath) return;
    try {
      const content = await readFile(this.persistencePath, "utf8");
      const rows: unknown = JSON.parse(content);
      if (!Array.isArray(rows)) throw new Error("Session store must contain an array");
      for (const row of rows) {
        const session = sessionSchema.parse(row);
        if ((!terminalStates.has(session.state) || session.ended === false) && session.source !== "desktop-app") {
          this.#sessions.set(session.id, session);
          this.#restored.add(session.id);
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  list(): Session[] {
    return [...this.#sessions.values()].filter((session) => !this.#restored.has(session.id)).sort((left, right) => right.lastActivityAt.localeCompare(left.lastActivityAt));
  }

  get(id: string): Session | undefined {
    return this.#sessions.get(id);
  }

  remove(id: string): void {
    const timer = this.#expiryTimers.get(id);
    if (timer) clearTimeout(timer);
    this.#expiryTimers.delete(id);
    this.#restored.delete(id);
    if (!this.#sessions.delete(id)) return;
    this.#publish({ type: "remove", id });
    this.#persist();
  }

  upsert(input: SessionInput, activityAt?: string, stateChangedAt?: string): Session {
    const now = new Date().toISOString();
    const previous = this.#sessions.get(input.id);
    const activity = activityAt && Number.isFinite(Date.parse(activityAt)) ? new Date(activityAt).toISOString() : now;
    const observedTransition = stateChangedAt && Number.isFinite(Date.parse(stateChangedAt)) ? new Date(stateChangedAt).toISOString() : undefined;
    const mergedInput: SessionInput = {
      ...input,
      harness: input.harness ?? previous?.harness,
      model: input.model ?? previous?.model,
      tokensUsed: input.tokensUsed ?? previous?.tokensUsed,
      contextUsedPercent: input.contextUsedPercent ?? previous?.contextUsedPercent,
      freedom: input.freedom ?? previous?.freedom,
      approval: input.approval ?? previous?.approval,
      label: input.label,
      focusTarget: input.focusTarget ?? previous?.focusTarget,
      project: input.project ?? previous?.project,
      metadata: input.metadata ?? previous?.metadata,
    };
    const transition = observedTransition ?? (previous?.state === input.state ? previous.stateChangedAt ?? previous.lastActivityAt : activity);
    const { dismissedAt: previousDismissal, attendedAt: previousAttention, ...kept } = previous ?? {};
    // A dismissed or attended session goes back to normal when its state changes, or when it enters the same state again (a new state change time).
    const sameCompletion = previous?.state === input.state && previous.stateChangedAt === transition;
    const dismissedAt = previousDismissal && sameCompletion ? previousDismissal : undefined;
    const attendedAt = previousAttention && sameCompletion ? previousAttention : undefined;
    const session: Session = {
      ...kept,
      ...mergedInput,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      lastActivityAt: activity,
      stateChangedAt: transition,
      ...(dismissedAt ? { dismissedAt } : {}),
      ...(attendedAt ? { attendedAt } : {}),
    };
    this.#restored.delete(session.id);
    this.#sessions.set(session.id, session);
    this.#scheduleExpiry(session);
    this.#publish({ type: "upsert", session });
    this.#persist();
    return session;
  }

  /** Hide a DONE, FAILED, or UNKNOWN session until its state changes. Returns undefined when the session is missing or active. */
  dismiss(id: string): Session | undefined {
    const existing = this.#sessions.get(id);
    if (!existing || !dismissableStates.includes(existing.state)) return undefined;
    if (existing.dismissedAt) return existing;
    const session: Session = { ...existing, dismissedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.#sessions.set(id, session);
    this.#publish({ type: "upsert", session });
    this.#persist();
    return session;
  }

  /** Mark a DONE session as attended until its state changes. Returns undefined when the session is missing or not DONE. */
  attend(id: string): Session | undefined {
    const existing = this.#sessions.get(id);
    if (!existing || existing.state !== "done") return undefined;
    if (existing.attendedAt) return existing;
    const session: Session = { ...existing, attendedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.#sessions.set(id, session);
    this.#publish({ type: "upsert", session });
    this.#persist();
    return session;
  }

  end(id: string, state: "done" | "failed" = "done"): Session | undefined {
    const existing = this.#sessions.get(id);
    if (!existing) return undefined;
    return this.upsert({ ...existing, state, ended: true });
  }

  subscribe(listener: (event: HubEvent) => void): () => void {
    this.#events.on("change", listener);
    return () => this.#events.off("change", listener);
  }

  async close(): Promise<void> {
    for (const timer of this.#expiryTimers.values()) clearTimeout(timer);
    this.#expiryTimers.clear();
    this.#events.removeAllListeners();
    await this.#persistQueue;
  }

  #scheduleExpiry(session: Session): void {
    const previous = this.#expiryTimers.get(session.id);
    if (previous) clearTimeout(previous);
    this.#expiryTimers.delete(session.id);
    if (!terminalStates.has(session.state)) return;
    if (session.ended === false) return;
    const timer = setTimeout(() => {
      this.#sessions.delete(session.id);
      this.#expiryTimers.delete(session.id);
      this.#publish({ type: "remove", id: session.id });
      this.#persist();
    }, terminalLifetimeMs);
    timer.unref?.();
    this.#expiryTimers.set(session.id, timer);
  }

  #publish(event: HubEvent): void {
    this.#events.emit("change", event);
  }

  #persist(): void {
    if (!this.persistencePath) return;
    const output = JSON.stringify([...this.#sessions.values()], null, 2);
    this.#persistQueue = this.#persistQueue.then(async () => {
      await mkdir(dirname(this.persistencePath!), { recursive: true });
      const temporaryPath = `${this.persistencePath}.tmp`;
      await writeFile(temporaryPath, output, { mode: 0o600 });
      await rename(temporaryPath, this.persistencePath!);
    }).catch((error: unknown) => {
      console.error("Unable to persist session metadata", error);
    });
  }
}
