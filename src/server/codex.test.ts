import { afterEach, describe, expect, it, vi } from "vitest";
import { appendFile, mkdtemp, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodexSessionState, CodexTracker, codexOwners, type CodexOwner } from "./codex.js";
import { SessionStore } from "./store.js";

const directories: string[] = [];
const stores: SessionStore[] = [];
const timestamp = "2026-10-25T12:00:00.000Z";
const sessionIds = ["01a17262-f61c-7501-988b-431b6f69505f", "01a172a6-5d2f-7b30-a980-01f1aa869ceb"];
const event = (type: string, payload: Record<string, unknown> = {}) => JSON.stringify({ type, timestamp, payload }) + "\n";
const message = (type: string, payload: Record<string, unknown> = {}) => event("event_msg", { type, ...payload });

afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.close()));
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  vi.useRealTimers();
});

async function fixture(): Promise<{ root: string; store: SessionStore; tracker: CodexTracker; owners: CodexOwner[] }> {
  const root = await mkdtemp(join(tmpdir(), "ai-ai-captain-codex-"));
  directories.push(root);
  const store = new SessionStore();
  stores.push(store);
  const directory = join(root, "sessions", "2026", "10", "25");
  await mkdir(directory, { recursive: true });
  const owners = sessionIds.map((sessionId) => ({ sessionId, rolloutPath: join(directory, `rollout-2026-10-25T10-27-31-${sessionId}.jsonl`), pid: 123, focusTarget: { appName: "IntelliJ IDEA", pid: 10, appPath: "/Applications/IntelliJ IDEA.app" } }));
  for (const owner of owners) {
    await writeFile(owner.rolloutPath, event("session_meta", { id: owner.sessionId, cwd: "/projects/example", originator: "JetBrains.IntelliJ IDEA", base_instructions: "private instructions" }) + event("turn_context", { cwd: "/projects/example", model: "gpt-6.1-sol" }));
  }
  return { root, store, tracker: new CodexTracker(store, root), owners };
}

describe("Codex session tracking", () => {
  it("removes closed projects while their Codex runtime stays alive and only restores a newly triggered turn", async () => {
    const { store, tracker, owners } = await fixture();
    let closed = false;
    const inspect = async (owner: CodexOwner) => ({ status: closed && owner === owners[0] ? "closed" as const : "open" as const, evidence: "test project registry" });
    await tracker.reconcile(owners, inspect);
    closed = true;
    await tracker.reconcile(owners, inspect);
    expect(store.get(`codex:${sessionIds[0]}`)).toBeUndefined();
    expect(store.list()).toHaveLength(1);
    await appendFile(owners[0].rolloutPath!, message("task_complete"));
    await tracker.reconcile(owners, inspect);
    closed = false;
    await tracker.reconcile(owners, inspect);
    expect(store.get(`codex:${sessionIds[0]}`)).toBeUndefined();
    await appendFile(owners[0].rolloutPath!, JSON.stringify({ type: "event_msg", timestamp: "2026-10-25T13:00:00.000Z", payload: { type: "task_started" } }) + "\n");
    await tracker.reconcile(owners, inspect);
    expect(store.get(`codex:${sessionIds[0]}`)?.state).toBe("working");
    expect(store.list()).toHaveLength(2);
  });

  it("filters history older than project registration even when discovering an already reopened project", async () => {
    const { store, tracker, owners } = await fixture();
    const openedAt = Date.parse("2026-10-25T12:30:00.000Z");
    await tracker.reconcile(owners, async () => ({ status: "open", evidence: "test", openedAt }));
    expect(store.list()).toHaveLength(0);
    await appendFile(owners[0].rolloutPath!, event("turn_context", { cwd: "/projects/example", model: "updated-model" }) + message("token_count"));
    await tracker.reconcile(owners, async () => ({ status: "open", evidence: "test", openedAt }));
    expect(store.list()).toHaveLength(0);
    await appendFile(owners[0].rolloutPath!, JSON.stringify({ type: "event_msg", timestamp: "2026-10-25T13:00:00.000Z", payload: { type: "task_started" } }) + "\n");
    await tracker.reconcile(owners, async () => ({ status: "open", evidence: "test", openedAt }));
    expect(store.list()).toHaveLength(1);
    await tracker.reconcile(owners, async () => ({ status: "closed", evidence: "Terminal connection revoked" }));
    expect(store.list()).toHaveLength(0);
  });

  it("tracks independent IDE conversations from real turn lifecycle events, not app presence or model names", async () => {
    const { store, tracker, owners } = await fixture();
    await appendFile(owners[0].rolloutPath!, message("task_started", { turn_id: "active" }) + event("response_item", { type: "message", content: "private prompt" }));
    await appendFile(owners[1].rolloutPath!, message("task_started") + message("task_complete", { last_agent_message: "private response" }));
    await tracker.reconcile(owners);
    expect(store.list()).toHaveLength(2);
    expect(store.get(`codex:${sessionIds[0]}`)).toMatchObject({ state: "working", source: "codex-local", harness: "codex-ide", model: "gpt-6.1-sol", project: "/projects/example", focusTarget: owners[0].focusTarget, lastActivityAt: timestamp });
    expect(store.get(`codex:${sessionIds[1]}`)).toMatchObject({ state: "done", ended: false });
    expect(JSON.stringify(store.list())).not.toMatch(/private|instructions|content|last_agent_message/);
    const updates = vi.fn();
    store.subscribe(updates);
    await tracker.reconcile(owners);
    expect(updates).not.toHaveBeenCalled();
    await appendFile(owners[0].rolloutPath!, message("task_complete", { turn_id: "active" }));
    await tracker.reconcile(owners);
    expect(store.get(`codex:${sessionIds[0]}`)?.state).toBe("done");
    vi.useFakeTimers();
    vi.advanceTimersByTime(11_000);
    expect(store.list()).toHaveLength(2);
  });

  it("handles model changes, cancellation, failures, late completion, and tool errors without false session completion", () => {
    const state = new CodexSessionState();
    state.apply(JSON.parse(message("task_started", { turn_id: "new" })));
    state.apply(JSON.parse(message("task_complete", { turn_id: "old" })));
    expect(state.state).toBe("working");
    state.apply(JSON.parse(message("item_completed", { item: { type: "CommandExecution", exit_code: 1, status: "failed" } })));
    expect(state.state).toBe("working");
    state.apply(JSON.parse(message("thread_settings_applied", { thread_settings: { model: "updated-model", cwd: "/projects/other" } })));
    expect(state).toMatchObject({ model: "updated-model", project: "/projects/other", state: "working" });
    state.apply(JSON.parse(message("turn_aborted", { turn_id: "new" })));
    expect(state.state).toBe("done");
    state.apply(JSON.parse(message("error", { message: "private failure" })));
    expect(state.state).toBe("failed");
    state.apply(JSON.parse(message("task_started", { turn_id: "retry" })));
    expect(state.state).toBe("working");
  });

  it("waits for blocking input requests without retaining their questions or answers", () => {
    const state = new CodexSessionState();
    state.apply(JSON.parse(message("task_started")));
    for (const callId of ["first", "second"]) state.apply(JSON.parse(event("response_item", { type: "function_call", name: "functions.request_user_input", call_id: callId, arguments: "private questions" })));
    expect(state.state).toBe("waiting");
    state.apply(JSON.parse(event("response_item", { type: "function_call_output", call_id: "first", output: "private answer" })));
    expect(state.state).toBe("waiting");
    state.apply(JSON.parse(event("response_item", { type: "function_call_output", call_id: "second", output: "private answer" })));
    expect(state.state).toBe("working");
    expect(JSON.stringify(state)).not.toContain("private");
    state.apply(JSON.parse(event("response_item", { type: "function_call", name: "functions.request_user_input_async", call_id: "async" })));
    expect(state.state).toBe("working");
  });

  it("keeps the actual completion time when token counts or settings change afterward", () => {
    const state = new CodexSessionState();
    state.apply({ type: "event_msg", timestamp, payload: { type: "task_started" } });
    const completed = "2026-10-25T12:01:00.000Z";
    const later = "2026-10-25T12:09:00.000Z";
    state.apply({ type: "event_msg", timestamp: completed, payload: { type: "task_complete" } });
    state.apply({ type: "event_msg", timestamp: later, payload: { type: "token_count" } });
    state.apply({ type: "event_msg", timestamp: later, payload: { type: "thread_settings_applied", thread_settings: { model: "updated-model" } } });
    expect(state).toMatchObject({ state: "done", stateChangedAt: completed, lastActivityAt: later });
  });

  it("reads token totals, context use, freedom, and approval without keeping paths", () => {
    const state = new CodexSessionState();
    state.apply({ type: "turn_context", timestamp, payload: { model: "gpt-5.5", approval_policy: "never", sandbox_policy: { type: "danger-full-access", writable_roots: ["/private/path"] } } });
    state.apply({ type: "event_msg", timestamp, payload: { type: "token_count", info: { total_token_usage: { total_tokens: 148_000 }, last_token_usage: { total_tokens: 64_600 }, model_context_window: 258_400 } } });
    expect(state).toMatchObject({ freedom: "full", approval: "never", tokensUsed: 148_000, contextUsedPercent: 25 });
    expect(JSON.stringify(state)).not.toContain("private");
    state.apply({ type: "turn_context", timestamp, payload: { approval_policy: "on-request", sandbox_policy: { type: "workspace-write" } } });
    expect(state).toMatchObject({ freedom: "limited", approval: "asks" });
  });

  it("ignores token events without usable numbers", () => {
    const state = new CodexSessionState();
    state.apply({ type: "event_msg", timestamp, payload: { type: "token_count", info: null } });
    state.apply({ type: "event_msg", timestamp, payload: { type: "token_count", info: { last_token_usage: { total_tokens: 10 }, model_context_window: 0 } } });
    expect(state.tokensUsed).toBeUndefined();
    expect(state.contextUsedPercent).toBeUndefined();
  });

  it("handles partial writes, invalid JSON, truncation, and file replacement", async () => {
    const { store, tracker, owners } = await fixture();
    const path = owners[0].rolloutPath!;
    const partial = message("task_started");
    await tracker.reconcile(owners);
    await appendFile(path, "not-json\n" + partial.slice(0, -2));
    await tracker.reconcile(owners);
    expect(store.get(`codex:${sessionIds[0]}`)?.state).toBe("starting");
    await appendFile(path, partial.slice(-2));
    await tracker.reconcile(owners);
    expect(store.get(`codex:${sessionIds[0]}`)?.state).toBe("working");
    await writeFile(path, message("task_complete"));
    await tracker.reconcile(owners);
    expect(store.get(`codex:${sessionIds[0]}`)?.state).toBe("done");
    await writeFile(`${path}.new`, message("task_started"));
    await rename(`${path}.new`, path);
    await tracker.reconcile(owners);
    expect(store.get(`codex:${sessionIds[0]}`)?.state).toBe("working");
  });

  it("marks missing telemetry unknown, recovers without a new event, and ends only when live ownership disappears", async () => {
    const { store, tracker, owners } = await fixture();
    const path = owners[0].rolloutPath!;
    await appendFile(path, message("task_started"));
    await tracker.reconcile(owners);
    tracker.unavailable();
    expect(store.get(`codex:${sessionIds[0]}`)?.state).toBe("unknown");
    await tracker.reconcile(owners);
    expect(store.get(`codex:${sessionIds[0]}`)?.state).toBe("working");
    await rename(path, `${path}.hidden`);
    await tracker.reconcile(owners);
    expect(store.get(`codex:${sessionIds[0]}`)).toMatchObject({ state: "unknown", metadata: { telemetryStatus: "missing", telemetryError: "ENOENT", telemetryLocation: path, lastTelemetryAt: timestamp } });
    await rename(`${path}.hidden`, path);
    await tracker.reconcile(owners);
    expect(store.get(`codex:${sessionIds[0]}`)?.state).toBe("working");
    await tracker.reconcile([owners[1]]);
    expect(store.get(`codex:${sessionIds[0]}`)).toMatchObject({ state: "done", ended: true });
    vi.useFakeTimers();
    await tracker.reconcile([]);
    vi.advanceTimersByTime(10_000);
    expect(store.get(`codex:${sessionIds[1]}`)).toBeUndefined();
  });

  it("finds rollouts for live writer locks without reviving unowned historical sessions", async () => {
    const { store, tracker, owners } = await fixture();
    await appendFile(owners[0].rolloutPath!, message("task_complete"));
    await tracker.reconcile([{ ...owners[0], rolloutPath: undefined }]);
    expect(store.list()).toHaveLength(1);
    expect(store.get(`codex:${sessionIds[0]}`)?.state).toBe("done");
    expect(store.get(`codex:${sessionIds[1]}`)).toBeUndefined();
  });

  it("reports genuinely owned sessions without rollout events as unknown, not working", async () => {
    const { store, tracker } = await fixture();
    await tracker.reconcile([{ sessionId: "01a17262-0000-0000-0000-000000000000", pid: 321, focusTarget: { appName: "Terminal" } }]);
    expect(store.list()[0]).toMatchObject({ harness: "codex-cli", state: "unknown", metadata: { stateEvent: "events.unavailable", telemetryStatus: "missing" } });
    expect(store.list()[0].metadata?.lastTelemetryAt).toBeUndefined();
  });

  it("marks sessions hosted by the ChatGPT desktop app as Codex desktop app sessions", async () => {
    const { store, tracker } = await fixture();
    await tracker.reconcile([{ sessionId: "01a17262-0000-0000-0000-000000000001", pid: 322, focusTarget: { appName: "ChatGPT" } }]);
    expect(store.list()[0]).toMatchObject({ harness: "codex-app" });
  });

  it.skipIf(process.platform === "win32")("distinguishes readable but unsupported telemetry from a read failure", async () => {
    const { store, tracker, owners } = await fixture();
    await writeFile(owners[0].rolloutPath!, "not-json\n");
    await tracker.reconcile(owners);
    expect(store.get(`codex:${sessionIds[0]}`)).toMatchObject({ state: "unknown", metadata: { telemetryStatus: "unrecognized" } });
    await rm(owners[0].rolloutPath!);
    await mkdir(owners[0].rolloutPath!);
    await tracker.reconcile(owners);
    expect(store.get(`codex:${sessionIds[0]}`)).toMatchObject({ state: "unknown", metadata: { telemetryStatus: "unreadable", telemetryError: "EISDIR" } });
  });

  it("discovers live rollout and writer-lock ownership and the exact IntelliJ ancestor", () => {
    const root = "/home/example/.codex";
    const processes = [{ pid: 123, parentPid: 20, name: "/cache/bin/codex" }, { pid: 20, parentPid: 10, name: "/runtime/node" }, { pid: 10, parentPid: 1, name: "/Applications/IntelliJ IDEA.app/Contents/MacOS/idea" }];
    const path = `${root}/sessions/2026/10/25/rollout-2026-10-25T10-27-31-${sessionIds[0]}.jsonl`;
    const output = `p123\nn${root}/thread-writer-locks/${sessionIds[0]}.lock\nn${path}\nn${root}/thread-writer-locks/.coordination.lock\nn${root}/sessions/../unrelated.jsonl\nn/other/root/thread-writer-locks/${sessionIds[1]}.lock\np999\nn${root}/thread-writer-locks/${sessionIds[1]}.lock\n`;
    expect(codexOwners(output, root, processes)).toEqual([{ sessionId: sessionIds[0], pid: 123, rolloutPath: path, focusTarget: { appName: "IntelliJ IDEA", appPath: "/Applications/IntelliJ IDEA.app", pid: 10 } }]);
    expect(codexOwners(`p123\nn${path}\n`, root, processes)).toHaveLength(1);
  });
});
