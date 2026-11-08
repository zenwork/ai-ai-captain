import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { recordingSchema } from "../../e2e/harness/recording.js";
import { ClaudeStatusRecorder, watchClaudeSession } from "./watch-claude-session.js";

const sessionIdentifier = "11111111-2222-3333-4444-555555555555";
const processIdentifier = 4242;
const pollMilliseconds = 20;
// The export drops a state that lasts less than 500 ms, so each status must last longer.
const statusChangePauseMilliseconds = 600;

function registration(status: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { pid: processIdentifier, sessionId: sessionIdentifier, version: "2.1.319", cwd: "/Users/CANARY-user/secret", name: "CANARY-name", status, ...extra };
}

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

describe("the status recorder", () => {
  it("keeps each change of the status and ignores a repeated or unsafe status", () => {
    const recorder = new ClaudeStatusRecorder();
    recorder.observe({ pid: 1, sessionId: "a", status: "busy" }, 1_000);
    recorder.observe({ pid: 1, sessionId: "a", status: "busy" }, 1_100);
    recorder.observe({ pid: 1, sessionId: "a", status: "Permission Required: CANARY" }, 1_200);
    recorder.observe({ pid: 1, sessionId: "a", status: "permission_required", statusUpdatedAt: 1_500 }, 1_600);
    expect(recorder.events.map((event) => [event.line.status, event.timestampMilliseconds])).toEqual([
      ["busy", 1_000],
      ["permission_required", 1_500],
    ]);
  });

  it("starts at the time of the watch, even when the first status is old", () => {
    const recorder = new ClaudeStatusRecorder();
    recorder.observe({ pid: 1, sessionId: "a", status: "idle", statusUpdatedAt: 10 }, 5_000);
    expect(recorder.events[0]?.timestampMilliseconds).toBe(5_000);
  });

  it("stops with a clear message when it saw no status", () => {
    expect(() => new ClaudeStatusRecorder().toRecording()).toThrow(/no status/);
  });
});

describe("the watch of a session", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "watch-claude-"));
    await mkdir(join(home, "sessions"));
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it("records waiting and ends when the registration disappears", async () => {
    const file = join(home, "sessions", `${String(processIdentifier)}.json`);
    await writeFile(file, JSON.stringify(registration("busy")));
    const controller = new AbortController();
    const watching = watchClaudeSession({ home, intervalMilliseconds: pollMilliseconds, signal: controller.signal, report: () => undefined });
    for (const status of ["permission_required", "busy", "idle"]) {
      await pause(statusChangePauseMilliseconds);
      await writeFile(file, JSON.stringify(registration(status)));
    }
    await pause(statusChangePauseMilliseconds);
    await rm(file);
    const recording = await watching;
    expect(() => recordingSchema.parse(recording)).not.toThrow();
    expect(recording.expected.map((entry) => entry.state)).toEqual(["working", "waiting", "working", "done", null]);
    expect(recording.header).toMatchObject({ agent: "claude-code", agentVersion: "2.1.319" });
    expect(JSON.stringify(recording)).not.toContain("CANARY");
    expect(JSON.stringify(recording)).not.toContain("/Users/");
  });

  it("stops when the signal aborts", async () => {
    await writeFile(join(home, "sessions", "1.json"), JSON.stringify(registration("busy", { pid: 1 })));
    const controller = new AbortController();
    const watching = watchClaudeSession({ home, target: "1", intervalMilliseconds: pollMilliseconds, signal: controller.signal, report: () => undefined });
    await pause(statusChangePauseMilliseconds);
    controller.abort();
    expect((await watching).expected.map((entry) => entry.state)).toEqual(["working", null]);
  });

  it("asks for an identifier when more than one session runs", async () => {
    await writeFile(join(home, "sessions", "1.json"), JSON.stringify(registration("busy", { pid: 1 })));
    await writeFile(join(home, "sessions", "2.json"), JSON.stringify(registration("idle", { pid: 2, sessionId: "other" })));
    const controller = new AbortController();
    await expect(watchClaudeSession({ home, intervalMilliseconds: pollMilliseconds, signal: controller.signal, report: () => undefined })).rejects.toThrow(
      /More than one session/,
    );
  });
});
