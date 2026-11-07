import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { exportCodexRecording } from "../../scripts/diagnostics/export-codex-recording.js";
import { exportCopilotRecording } from "../../scripts/diagnostics/export-copilot-recording.js";
import { isAgentSimulationSupported } from "../harness/agent-process.js";
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
});
