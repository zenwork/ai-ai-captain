import { afterEach, describe, expect, it, vi } from "vitest";
import { appendFile, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CopilotSessionState, CopilotTracker, copilotOwners, type CopilotOwner } from "./copilot.js";
import { SessionStore } from "./store.js";

const directories: string[] = [];
const stores: SessionStore[] = [];
const timestamp = "2026-10-25T12:00:00.000Z";
const event = (type: string, data: Record<string, unknown> = {}) => JSON.stringify({ type, timestamp, data }) + "\n";

afterEach(async () => {
  for (const store of stores.splice(0)) store.close();
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  vi.useRealTimers();
});

async function fixture(): Promise<{ store: SessionStore; tracker: CopilotTracker; owners: CopilotOwner[] }> {
  const root = await mkdtemp(join(tmpdir(), "ai-ai-captain-copilot-"));
  directories.push(root);
  const store = new SessionStore();
  stores.push(store);
  const owners = ["first-session", "second-session"].map((sessionId) => ({ sessionId, directory: join(root, sessionId), pid: 123, focusTarget: { appName: "IntelliJ IDEA", pid: 10 } }));
  for (const owner of owners) {
    await mkdir(owner.directory);
    await writeFile(join(owner.directory, "events.jsonl"), event("session.start", { selectedModel: "gpt-6.1-sol", context: { cwd: "/projects/example" } }));
  }
  return { store, tracker: new CopilotTracker(store, root), owners };
}

describe("Copilot session tracking", () => {
  it("removes closed projects immediately, keeps the active project, and requires a new turn after reopening", async () => {
    const { store, tracker, owners } = await fixture();
    const first = join(owners[0].directory, "events.jsonl");
    let closed = false;
    const inspect = async (owner: CopilotOwner) => ({ status: closed && owner === owners[0] ? "closed" as const : "open" as const, evidence: "test project registry" });
    await tracker.reconcile(owners, inspect);
    expect(store.list()).toHaveLength(2);
    closed = true;
    await tracker.reconcile(owners, inspect);
    expect(store.get("copilot:first-session")).toBeUndefined();
    expect(store.list()).toHaveLength(1);
    await appendFile(first, event("assistant.turn_end"));
    await tracker.reconcile(owners, inspect);
    closed = false;
    await tracker.reconcile(owners, inspect);
    expect(store.get("copilot:first-session")).toBeUndefined();
    await appendFile(first, JSON.stringify({ type: "user.message", timestamp: "2026-10-25T13:00:00.000Z", data: { content: "private prompt" } }) + "\n");
    await tracker.reconcile(owners, inspect);
    expect(store.get("copilot:first-session")?.state).toBe("working");
    expect(store.list()).toHaveLength(2);
  });

  it("does not restore conversations predating a reopened project and removes revoked CLI terminals", async () => {
    const { store, tracker, owners } = await fixture();
    const openedAt = Date.parse("2026-10-25T12:30:00.000Z");
    await tracker.reconcile(owners, async () => ({ status: "open", evidence: "test", openedAt }));
    expect(store.list()).toHaveLength(0);
    await appendFile(join(owners[0].directory, "events.jsonl"), JSON.stringify({ type: "session.resume", timestamp: "2026-10-25T13:00:00.000Z" }) + "\n");
    await tracker.reconcile(owners, async () => ({ status: "open", evidence: "test", openedAt }));
    expect(store.list()).toHaveLength(1);
    await tracker.reconcile(owners, async () => ({ status: "closed", evidence: "Terminal connection revoked" }));
    expect(store.list()).toHaveLength(0);
  });

  it("tracks two sessions in the same IDE runtime independently and discards chat content", async () => {
    const { store, tracker, owners } = await fixture();
    await appendFile(join(owners[0].directory, "events.jsonl"), event("user.message", { content: "private prompt" }) + event("assistant.turn_start"));
    await appendFile(join(owners[1].directory, "events.jsonl"), event("assistant.message", { content: "private response", model: "claude-opus-5.5" }) + event("assistant.turn_end"));
    await tracker.reconcile(owners);
    expect(store.list()).toHaveLength(2);
    expect(store.get("copilot:first-session")).toMatchObject({ state: "working", model: "gpt-6.1-sol", lastActivityAt: timestamp, metadata: { host: "IntelliJ IDEA" } });
    expect(store.get("copilot:second-session")).toMatchObject({ state: "done", ended: false, model: "claude-opus-5.5" });
    expect(JSON.stringify(store.list())).not.toMatch(/private prompt|private response|content/);
    let updates = 0;
    store.subscribe(() => updates++);
    await tracker.reconcile(owners);
    expect(updates).toBe(0);
    await appendFile(join(owners[0].directory, "events.jsonl"), event("assistant.turn_end"));
    await tracker.reconcile(owners);
    expect(store.get("copilot:first-session")?.state).toBe("done");
    expect(store.get("copilot:second-session")?.state).toBe("done");
    vi.useFakeTimers();
    vi.advanceTimersByTime(11_000);
    expect(store.list()).toHaveLength(2);
  });

  it("handles partial writes, file truncation, and a session closing", async () => {
    const { store, tracker, owners } = await fixture();
    const file = join(owners[0].directory, "events.jsonl");
    await tracker.reconcile(owners);
    const partial = event("assistant.turn_start");
    await appendFile(file, partial.slice(0, -2));
    await tracker.reconcile(owners);
    expect(store.get("copilot:first-session")?.state).toBe("starting");
    await appendFile(file, partial.slice(-2));
    await tracker.reconcile(owners);
    expect(store.get("copilot:first-session")?.state).toBe("working");
    await writeFile(file, event("assistant.turn_end"));
    await tracker.reconcile(owners);
    expect(store.get("copilot:first-session")?.state).toBe("done");
    await tracker.reconcile([owners[1]]);
    expect(store.get("copilot:first-session")).toMatchObject({ state: "done", ended: true });
    expect(store.get("copilot:second-session")?.ended).toBe(false);
  });

  it("keeps an open failed session visible and recovers when activity resumes", async () => {
    const { store, tracker, owners } = await fixture();
    await appendFile(join(owners[0].directory, "events.jsonl"), event("session.error", { message: "private error details" }));
    await tracker.reconcile(owners);
    vi.useFakeTimers();
    vi.advanceTimersByTime(11_000);
    expect(store.get("copilot:first-session")?.state).toBe("failed");
    vi.useRealTimers();
    await appendFile(join(owners[0].directory, "events.jsonl"), event("assistant.turn_start"));
    await tracker.reconcile(owners);
    expect(store.get("copilot:first-session")?.state).toBe("working");
    tracker.unavailable();
    expect(store.get("copilot:first-session")?.state).toBe("unknown");
    await tracker.reconcile(owners);
    expect(store.get("copilot:first-session")?.state).toBe("working");
  });

  it("exposes missing telemetry diagnostics and recovers without requiring another event", async () => {
    const { store, tracker, owners } = await fixture();
    const path = join(owners[0].directory, "events.jsonl");
    await appendFile(path, event("assistant.turn_start"));
    await tracker.reconcile(owners);
    await rm(path);
    await tracker.reconcile(owners);
    expect(store.get("copilot:first-session")).toMatchObject({ state: "unknown", metadata: { telemetryStatus: "missing", telemetryError: "ENOENT", telemetryLocation: path } });
    await writeFile(path, event("assistant.turn_start"));
    await tracker.reconcile(owners);
    expect(store.get("copilot:first-session")).toMatchObject({ state: "working", metadata: { telemetryStatus: "available", lastTelemetryAt: timestamp } });
    tracker.unavailable();
    expect(store.get("copilot:first-session")).toMatchObject({ state: "unknown", metadata: { telemetryStatus: "discovery-unavailable" } });
  });

  it("waits for all outstanding permissions before showing running again", () => {
    const state = new CopilotSessionState();
    state.apply({ type: "assistant.turn_start" });
    state.apply({ type: "permission.requested", data: { requestId: "first" } });
    state.apply({ type: "permission.requested", data: { requestId: "second" } });
    state.apply({ type: "tool.execution_complete", data: { success: false } });
    expect(state.state).toBe("waiting");
    state.apply({ type: "permission.completed", data: { requestId: "first" } });
    expect(state.state).toBe("waiting");
    state.apply({ type: "permission.completed", data: { requestId: "second" } });
    expect(state.state).toBe("working");
  });

  it("reserves waiting for requested actions and keeps completed conversations open", () => {
    const state = new CopilotSessionState();
    state.apply({ type: "assistant.turn_start" });
    state.apply({ type: "tool.execution_start", data: { toolName: "ask_user", toolCallId: "question" } });
    expect(state.state).toBe("waiting");
    state.apply({ type: "assistant.turn_end" });
    expect(state.state).toBe("waiting");
    state.apply({ type: "tool.execution_complete", data: { toolCallId: "question" } });
    expect(state.state).toBe("working");
    state.apply({ type: "assistant.turn_end" });
    expect(state).toMatchObject({ state: "done", ended: false });
    state.apply({ type: "session.shutdown" });
    expect(state).toMatchObject({ state: "done", ended: true });
    state.apply({ type: "session.resume" });
    expect(state).toMatchObject({ state: "starting", ended: false });
  });

  it("timestamps completion separately from later metadata or repeated idle notifications", () => {
    const state = new CopilotSessionState();
    state.apply({ type: "assistant.turn_start", timestamp });
    const completed = "2026-10-25T12:01:00.000Z";
    const later = "2026-10-25T12:09:00.000Z";
    state.apply({ type: "assistant.turn_end", timestamp: completed });
    state.apply({ type: "session.model_change", timestamp: later, data: { newModel: "another-model" } });
    state.apply({ type: "session.idle", timestamp: later });
    expect(state).toMatchObject({ state: "done", stateChangedAt: completed, lastActivityAt: later });
    state.apply({ type: "assistant.turn_start", timestamp: later });
    state.apply({ type: "assistant.turn_end", timestamp: "2026-10-25T12:09:01.000Z" });
    expect(state.stateChangedAt).toBe("2026-10-25T12:09:01.000Z");
  });

  it("uses open hold files rather than stale lock files and resolves the IDE ancestor", () => {
    const root = "/home/example/.copilot/session-state";
    const processes = [{ pid: 123, parentPid: 20, name: "/cache/copilot-runtime" }, { pid: 20, parentPid: 10, name: "/plugins/copilot-language-server" }, { pid: 10, parentPid: 1, name: "/Applications/IntelliJ IDEA.app/Contents/MacOS/idea" }];
    const output = `p123\nn${root}/first-session/inuse.123.hold\nn${root}/old-session/inuse.123.lock\nn${root}/wrong-owner/inuse.456.hold\nn/other/root/unrelated/inuse.123.hold\n`;
    expect(copilotOwners(output, root, processes)).toEqual([{ sessionId: "first-session", pid: 123, directory: `${root}/first-session`, focusTarget: { appName: "IntelliJ IDEA", pid: 10, appPath: "/Applications/IntelliJ IDEA.app" } }]);
  });
});
