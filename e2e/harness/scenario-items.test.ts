import { describe, expect, it } from "vitest";
import { recordingSchema } from "./recording.js";
import { itemsToRecording, recordingToItems } from "./scenario-items.js";

const header = { source: "test", agent: "claude-code", agentVersion: "2.x" };

describe("recordings and scenario items", () => {
  it("puts the steps of a timeline before the expectations of the same time", () => {
    const recording = recordingSchema.parse({
      header: { formatVersion: 1, ...header, platform: "any" },
      timeline: [
        { offset: "2s", operation: "exit", agent: "cli" },
        { offset: "0s", operation: "spawn", agent: "cli", processName: "claude" },
      ],
      expected: [
        { offset: "0s", session: "claude:{SESSION}", state: "working" },
        { offset: "2s", session: "claude:{SESSION}", state: null },
      ],
    });
    const kinds = recordingToItems(recording).map((item) => (item.kind === "operation" ? item.operation.operation : "expect"));
    expect(kinds).toEqual(["spawn", "expect", "exit", "expect"]);
  });

  it("keeps the session state and the absent session when it makes a recording again", () => {
    const recording = itemsToRecording(
      [
        { kind: "operation", operation: { operation: "spawn", agent: "cli", processName: "claude" } },
        { kind: "expectSession", sessionTemplate: "claude:{SESSION}", expected: { state: "working", harness: "claude-cli" }, options: {} },
        { kind: "expectSession", sessionTemplate: "claude:{SESSION}", expected: undefined, options: {} },
        { kind: "wait", milliseconds: 100 },
      ],
      header,
      true,
    );
    expect(recording.timeline).toHaveLength(1);
    expect(recording.expected.map((expectation) => expectation.state)).toEqual(["working", null]);
    expect(() => recordingSchema.parse(JSON.parse(JSON.stringify(recording)))).not.toThrow();
  });

  it("rejects a process name that is not safe", () => {
    const result = recordingSchema.safeParse({
      header: { formatVersion: 1, ...header, platform: "any" },
      timeline: [{ operation: "spawn", agent: "cli", processName: "../../bin/sh" }],
      expected: [],
    });
    expect(result.success).toBe(false);
  });
});
