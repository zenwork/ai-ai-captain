import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isAgentSimulationSupported } from "../harness/agent-process.js";
import { claudeCode } from "../harness/claude-code.js";
import type { Recording } from "../harness/recording.js";
import { scenario } from "../harness/scenario.js";
import { ScenarioFailure } from "../harness/scenario-player.js";
import { claudeCodeLifecycle } from "./claude-code-lifecycle.js";

const lifecycleRecording = fileURLToPath(new URL("../fixtures/claude-code/hand-written/lifecycle.recording.json", import.meta.url));

describe.skipIf(!isAgentSimulationSupported)("claude code life cycle", () => {
  it("walks through the life cycle from an inline scenario", async () => {
    await claudeCodeLifecycle().run();
  });

  it("walks through the life cycle from a recording", async () => {
    await scenario.fromRecording(lifecycleRecording).run();
  });

  it("gives the same operations and states from the inline scenario and from the recording", () => {
    // The time offsets can be different. Compare the operations, the file contents, and the states.
    const summarize = (recording: Recording): unknown => ({
      operations: recording.timeline.map((step) => [step.operation, step.operation === "write" ? step.content : undefined]),
      states: recording.expected.map((expectation) => [expectation.session, expectation.state]),
    });
    expect(summarize(claudeCodeLifecycle({ checkDeck: false }).toRecording())).toEqual(summarize(scenario.fromRecording(lifecycleRecording).toRecording()));
  });

  it("reports the scenario name, the step, and the last session when a state is wrong", async () => {
    const failing = scenario("wrong state", { cli: claudeCode({}) })
      .step("cli", (agent) => agent.spawn({ status: "busy" }))
      .expectSession("cli", { state: "done" }, { within: "2s" });
    const failure = await failing.run().then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(ScenarioFailure);
    expect(String(failure)).toMatch(/Scenario "wrong state" failed at step 3/);
    expect(String(failure)).toMatch(/"state":"working"/);
  });
});
