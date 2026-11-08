import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assembleRecording } from "./recording-export.js";
import { recordingSchema } from "../../e2e/harness/recording.js";
import { exportClaudeRecording } from "./export-claude-recording.js";
import { exportJunieRecording } from "./export-junie-recording.js";
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

  it("keeps the model and the safe settings, and drops a setting that is free text", () => {
    expect(recording.header.context?.model).toBe("test-model-1");
    expect(recording.header.context?.settings).toEqual({ approvalPolicy: "on-request" });
    expect(recording.header.context?.recordedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("describes the important states with fixed phrases", () => {
    const comments = recording.expected.map((entry) => entry.comment ?? "").join(" ");
    expect(comments).toContain("The session waits for the user.");
    expect(comments).toContain("The agent has finished its turn.");
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

describe("the export of a Claude Code session", () => {
  const recording = exportClaudeRecording(readFixture("claude-canary-transcript.jsonl"));

  it("makes a valid recording without content", () => {
    expect(() => recordingSchema.parse(recording)).not.toThrow();
    const output = JSON.stringify(recording);
    expect(output).not.toContain("CANARY");
    expect(output).not.toContain("/Users/");
    expect(recording.header).toMatchObject({ agent: "claude-code", agentVersion: "2.1.319" });
  });

  it("gives working and done for each turn, and ignores tool results and sub-agent lines", () => {
    expect(expectedStates(recording)).toEqual(["working", "done", "working", "done", null]);
  });

  it("never gives the state waiting, because the transcript has no permission request", () => {
    expect(expectedStates(recording)).not.toContain("waiting");
  });
});

describe("the export of a Junie session", () => {
  const recording = exportJunieRecording(readFixture("junie-canary-events.jsonl"));

  it("makes a valid recording without content", () => {
    expect(() => recordingSchema.parse(recording)).not.toThrow();
    const output = JSON.stringify(recording);
    expect(output).not.toContain("CANARY");
    expect(output).not.toContain("/Users/");
  });

  it("keeps each change of the state, including a request for input", () => {
    expect(expectedStates(recording)).toEqual(["working", "waiting", "working", "done"]);
  });

  it("does not stop the mock IDE", () => {
    expect(recording.timeline.some((step) => step.operation === "exit")).toBe(false);
  });
});

describe("the states of an export", () => {
  it("leaves out a state that the next state replaces in less than the polling time", () => {
    const recording = assembleRecording({
      agent: "test",
      agentVersion: undefined,
      preamble: [],
      toOperation: () => ({ operation: "append", agent: "agent", path: "file", content: {} }),
      sessionTemplate: "test:{SESSION}",
      endWithExit: false,
      events: [
        { line: {}, timestampMilliseconds: 0 },
        { line: {}, timestampMilliseconds: 1_000 },
        { line: {}, timestampMilliseconds: 1_001 },
        { line: {}, timestampMilliseconds: 3_000 },
      ],
      stateAfter: (_line, timestampMilliseconds) => (timestampMilliseconds === 1_000 ? "done" : "working"),
    });
    expect(recording.expected.map((entry) => entry.state)).toEqual(["working", "working"].slice(0, 1));
  });
});
