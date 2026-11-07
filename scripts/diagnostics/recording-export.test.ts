import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { recordingSchema } from "../../e2e/harness/recording.js";
import { exportCodexRecording } from "./export-codex-recording.js";
import { exportCopilotRecording } from "./export-copilot-recording.js";

function readFixture(name: string): string {
  return readFileSync(new URL(`../../e2e/fixtures/export/${name}`, import.meta.url), "utf8");
}

function expectedStates(recording: ReturnType<typeof exportCodexRecording>): (string | null)[] {
  return recording.expected.map((entry) => entry.state);
}

describe("the export of a Codex session", () => {
  const text = readFixture("codex-canary-rollout.jsonl");
  const recording = exportCodexRecording(text);

  it("makes a valid recording", () => {
    expect(() => recordingSchema.parse(recording)).not.toThrow();
    expect(recording.header).toMatchObject({ agent: "codex", agentVersion: "0.162.1", source: "export" });
  });

  it("keeps no content, no identifier, and no path", () => {
    const output = JSON.stringify(recording);
    expect(output).not.toContain("CANARY");
    expect(output).not.toContain("/Users/");
    expect(output).not.toContain("999");
  });

  it("keeps the sequence of states from the state reducer of the hub", () => {
    expect(expectedStates(recording)).toEqual(["starting", "working", "waiting", "working", "done", null]);
  });

  it("keeps the time between the events", () => {
    const offsets = recording.timeline.flatMap((step) => ("offset" in step && step.offset ? [step.offset] : []));
    expect(offsets).toContain("3s");
    expect(offsets.at(-1)).toBe("7s");
  });
});

describe("the export of a Copilot session", () => {
  const recording = exportCopilotRecording(readFixture("copilot-canary-events.jsonl"));

  it("makes a valid recording without content", () => {
    expect(() => recordingSchema.parse(recording)).not.toThrow();
    const output = JSON.stringify(recording);
    expect(output).not.toContain("CANARY");
    expect(output).not.toContain("/Users/");
  });

  it("keeps the sequence of states from the state reducer of the hub", () => {
    expect(expectedStates(recording)).toEqual(["starting", "working", "waiting", "working", "done", "failed", null]);
  });
});
