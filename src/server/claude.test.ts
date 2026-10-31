import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClaudeTracker, claudeRegistryState, parseClaudeTranscriptTail } from "./claude.js";
import type { ProcessInfo } from "./processes.js";
import { SessionStore } from "./store.js";

const startedAt = "2026-10-26T08:00:00.000Z";
const sessionId = "6ef2c5c7-a520-49a1-b6fb-5b3831863a22";
const secondSessionId = "842c282b-dfdf-450d-bd95-86d367aab5cb";
const directories: string[] = [];
const stores: SessionStore[] = [];
const processes: ProcessInfo[] = [
  { pid: 10, parentPid: 1, name: "/Applications/IntelliJ IDEA.app/Contents/MacOS/idea", startedAt },
  { pid: 20, parentPid: 10, name: "/cache/claude", startedAt },
  { pid: 30, parentPid: 1, name: "/Applications/Terminal.app/Contents/MacOS/Terminal", startedAt },
  { pid: 40, parentPid: 30, name: "/usr/local/bin/claude", startedAt },
  { pid: 50, parentPid: 1, name: "/Applications/Claude.app/Contents/MacOS/Claude", startedAt },
  { pid: 60, parentPid: 50, name: "/cache/claude", startedAt },
];

afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.close()));
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "ai-ai-captain-claude-"));
  directories.push(root);
  await mkdir(join(root, "sessions"));
  const store = new SessionStore();
  stores.push(store);
  const registration = async (pid = 20, fields: Record<string, unknown> = {}) => {
    await writeFile(join(root, "sessions", `${pid}.json`), JSON.stringify({
      pid, sessionId, cwd: "/projects/example", startedAt: Date.parse(startedAt), procStart: startedAt,
      pidDomain: "darwin", status: "busy", statusUpdatedAt: Date.parse(startedAt), ...fields,
    }));
  };
  return { root, store, tracker: new ClaudeTracker(store, root), registration };
}

describe("Claude transcript usage", () => {
  const assistantLine = (model: string, inputTokens: number, cacheRead: number): string => JSON.stringify({
    type: "assistant",
    message: { model, content: "private text", usage: { input_tokens: inputTokens, cache_creation_input_tokens: 0, cache_read_input_tokens: cacheRead } },
  });

  it("reads the model and context tokens from the latest assistant line only", () => {
    const tail = ["partial line", assistantLine("claude-opus-4", 10, 1000), JSON.stringify({ type: "user", message: "secret" }), assistantLine("claude-sonnet-5", 20, 49_980)].join("\n");
    expect(parseClaudeTranscriptTail(tail)).toEqual({ model: "claude-sonnet-5", tokensUsed: 50_000, contextUsedPercent: 25 });
  });

  it("ignores synthetic models and empty usage", () => {
    expect(parseClaudeTranscriptTail(assistantLine("<synthetic>", 0, 0))).toEqual({});
  });
});

describe("Claude registry tracking", () => {
  it.each([
    ["busy", "working"], ["running", "working"], ["idle", "done"], ["waiting", "waiting"],
    ["starting", "starting"], ["error", "failed"], ["new-format", "unknown"], [undefined, "unknown"],
  ])("maps registry status %s to %s", (status, state) => {
    expect(claudeRegistryState(status)).toBe(state);
  });

  it("keeps independent CLI, IntelliJ, and desktop Code sessions with the correct host badges", async () => {
    const { tracker, store, registration } = await fixture();
    await registration();
    await registration(40, { sessionId: secondSessionId, status: "waiting" });
    await registration(60, { sessionId: "19e3d9a9-2375-41d2-833b-81005f9b1a6f", status: "idle" });
    await tracker.scan(processes);
    expect(store.list()).toHaveLength(3);
    expect(store.get(`claude:${sessionId}`)).toMatchObject({ harness: "claude-ide", state: "working", focusTarget: { pid: 10, appPath: "/Applications/IntelliJ IDEA.app" } });
    expect(store.get(`claude:${secondSessionId}`)).toMatchObject({ harness: "claude-cli", state: "waiting" });
    expect(store.list().find((session) => session.harness === "claude-app")).toMatchObject({ state: "done", ended: false });
  });

  it("keeps DONE visible and does not restart completion attention on each scan", async () => {
    const { tracker, store, registration } = await fixture();
    await registration(20, { status: "idle" });
    await tracker.scan(processes);
    const before = store.get(`claude:${sessionId}`);
    await tracker.scan(processes);
    expect(store.get(`claude:${sessionId}`)).toBe(before);
    await registration(20, { status: "busy", statusUpdatedAt: Date.parse(startedAt) + 10000 });
    await tracker.scan(processes);
    expect(store.get(`claude:${sessionId}`)?.state).toBe("working");
  });

  it("interprets Claude's unzoned procStart value as UTC instead of the hub's local time", async () => {
    const { tracker, store, registration } = await fixture();
    await registration(20, { procStart: "Mon Oct 26 08:00:00 2026" });
    await tracker.scan(processes);
    expect(store.list()).toHaveLength(1);
  });

  it("rejects stale registrations, PID reuse, other executables, foreign PID domains, and wrong file owners", async () => {
    const { root, tracker, store, registration } = await fixture();
    await registration(999);
    await registration(20, { procStart: "2026-10-25T08:00:00Z" });
    await registration(40, { pidDomain: "linux" });
    await registration(60, { pid: 40 });
    await writeFile(join(root, "sessions", "10.json"), "{}");
    await tracker.scan(processes);
    expect(store.list()).toEqual([]);
  });

  it("removes sessions after runtime exit or registration removal", async () => {
    const { root, tracker, store, registration } = await fixture();
    await registration();
    await tracker.scan(processes);
    await tracker.scan(processes.filter((process) => process.pid !== 20));
    expect(store.list()).toEqual([]);
    await tracker.scan(processes);
    await rm(join(root, "sessions", "20.json"));
    await tracker.scan(processes);
    expect(store.list()).toEqual([]);
  });

  it("shows UNKNOWN on a partial registration and recovers without retaining private fields", async () => {
    const { root, tracker, store, registration } = await fixture();
    await registration(20, { name: "private-title", prompt: "private-prompt", messagingSocketPath: "private-socket", token: "private-token" });
    await tracker.scan(processes);
    expect(JSON.stringify(store.list())).not.toContain("private-");
    await writeFile(join(root, "sessions", "20.json"), "{");
    await tracker.scan(processes);
    expect(store.get(`claude:${sessionId}`)).toMatchObject({ state: "unknown", metadata: { telemetryError: "REGISTRATION_UNREADABLE" } });
    await registration(20, { status: "idle" });
    await tracker.scan(processes);
    expect(store.get(`claude:${sessionId}`)?.state).toBe("done");
    tracker.unavailable();
    expect(store.get(`claude:${sessionId}`)?.state).toBe("unknown");
  });

  it("filters closed projects and requires new work before a suppressed session returns", async () => {
    const { tracker, store, registration } = await fixture();
    let closed = false;
    const lifetime = async () => ({ status: closed ? "closed" as const : "open" as const, evidence: "project registration" });
    await registration();
    await tracker.scan(processes, lifetime);
    closed = true;
    await tracker.scan(processes, lifetime);
    expect(store.list()).toEqual([]);
    closed = false;
    await registration(20, { status: "idle" });
    await tracker.scan(processes, lifetime);
    expect(store.list()).toEqual([]);
    await registration(20, { status: "busy", statusUpdatedAt: Date.parse(startedAt) + 10000 });
    await tracker.scan(processes, lifetime);
    expect(store.get(`claude:${sessionId}`)?.state).toBe("working");
    await registration(20, { status: "idle", statusUpdatedAt: Date.parse(startedAt) + 20000 });
    await tracker.scan(processes, lifetime);
    expect(store.get(`claude:${sessionId}`)).toMatchObject({ state: "done", metadata: { lastTriggeredAt: "2026-10-26T08:00:10.000Z" } });
  });
});
