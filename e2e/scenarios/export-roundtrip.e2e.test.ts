import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ClaudeStatusRecorder } from "../../scripts/diagnostics/watch-claude-session.js";
import { exportClaudeRecording } from "../../scripts/diagnostics/export-claude-recording.js";
import { exportCodexRecording } from "../../scripts/diagnostics/export-codex-recording.js";
import { exportCopilotRecording } from "../../scripts/diagnostics/export-copilot-recording.js";
import { isAgentSimulationSupported } from "../harness/agent-process.js";
import { isJunieSimulationSupported } from "../harness/junie.js";
import { exportJunieRecording } from "../../scripts/diagnostics/export-junie-recording.js";
import { ScenarioBuilder } from "../harness/scenario.js";

function readFixture(name: string): string {
  return readFileSync(new URL(`../fixtures/export/${name}`, import.meta.url), "utf8");
}

describe.skipIf(!isAgentSimulationSupported)("a recording from an export", () => {
  it("gives the same states in the real hub for a Codex session", async () => {
    const recording = exportCodexRecording(readFixture("codex-canary-rollout.jsonl"));
    await expect(ScenarioBuilder.fromRecordingData("exported codex session", recording).run()).resolves.toBeUndefined();
  });

  it("gives the same states in the real hub for a Copilot session", async () => {
    const recording = exportCopilotRecording(readFixture("copilot-canary-events.jsonl"));
    await expect(ScenarioBuilder.fromRecordingData("exported copilot session", recording).run()).resolves.toBeUndefined();
  });

  it("gives the same states in the real hub for a Claude Code session", async () => {
    const recording = exportClaudeRecording(readFixture("claude-canary-transcript.jsonl"));
    await expect(ScenarioBuilder.fromRecordingData("exported claude session", recording).run()).resolves.toBeUndefined();
  });

  it.skipIf(!isJunieSimulationSupported)("gives the same states in the real hub for a Junie session", async () => {
    const recording = exportJunieRecording(readFixture("junie-canary-events.jsonl"));
    await expect(ScenarioBuilder.fromRecordingData("exported junie session", recording).run()).resolves.toBeUndefined();
  });

  it("gives waiting in the real hub for a recording of watched statuses", async () => {
    const recorder = new ClaudeStatusRecorder();
    const sessionBase = { pid: 1, sessionId: "a" };
    recorder.observe({ ...sessionBase, status: "busy" }, 1_000);
    recorder.observe({ ...sessionBase, status: "permission_required", statusUpdatedAt: 2_000 }, 2_000);
    recorder.observe({ ...sessionBase, status: "busy", statusUpdatedAt: 3_000 }, 3_000);
    recorder.observe({ ...sessionBase, status: "idle", statusUpdatedAt: 4_000 }, 4_000);
    const recording = recorder.toRecording();
    expect(recording.expected.map((entry) => entry.state)).toEqual(["working", "waiting", "working", "done", null]);
    await expect(ScenarioBuilder.fromRecordingData("watched claude session", recording).run()).resolves.toBeUndefined();
  });
});
