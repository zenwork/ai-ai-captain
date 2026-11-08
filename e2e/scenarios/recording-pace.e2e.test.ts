import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isAgentSimulationSupported } from "../harness/agent-process.js";
import { formatDurationMilliseconds, parseDurationMilliseconds } from "../harness/duration.js";
import { recordingSchema } from "../harness/recording.js";
import { ScenarioBuilder } from "../harness/scenario.js";

const recordingUrl = new URL("../fixtures/claude-code/hand-written/lifecycle.recording.json", import.meta.url);
// The scenario needs a hub start and some scans. A play in real time would need hours.
// The offsets of 0 to 6 seconds become 0 to 6,000 seconds.
const stretchFactor = 1_000;
const limitMilliseconds = 60_000;

describe.skipIf(!isAgentSimulationSupported)("the pace of a recording in a test", () => {
  it("ignores the times in the recording and waits only for the hub", async () => {
    const recording = recordingSchema.parse(JSON.parse(readFileSync(recordingUrl, "utf8")));
    const stretch = (offset: string | undefined): string | undefined =>
      offset === undefined ? undefined : formatDurationMilliseconds(parseDurationMilliseconds(offset) * stretchFactor);
    const stretched = {
      ...recording,
      timeline: recording.timeline.map((step) => ({ ...step, offset: stretch(step.offset) })),
      expected: recording.expected.map((entry) => ({ ...entry, offset: stretch(entry.offset) })),
    };
    const startedAt = Date.now();
    await expect(ScenarioBuilder.fromRecordingData("stretched recording", stretched).run()).resolves.toBeUndefined();
    expect(Date.now() - startedAt).toBeLessThan(limitMilliseconds);
  });
});
