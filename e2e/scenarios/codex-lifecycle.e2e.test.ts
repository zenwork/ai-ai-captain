import { describe, expect, it } from "vitest";
import { isAgentSimulationSupported } from "../harness/agent-process.js";
import { codex, CodexSteps } from "../harness/codex.js";
import { scenario } from "../harness/scenario.js";

describe.skipIf(!isAgentSimulationSupported)("codex life cycle", () => {
  it("walks through working, waiting, working, done, and exit", async () => {
    const play = scenario("codex life cycle")
      .agent("cli", codex({ model: "codex-model" }))
      .step("cli", (agent) => agent.as(CodexSteps).spawn())
      .step("cli", (agent) => agent.as(CodexSteps).turnContext())
      .step("cli", (agent) => agent.as(CodexSteps).startTurn())
      .expectSession("cli", { harness: "codex-cli", state: "working" })
      .step("cli", (agent) => agent.as(CodexSteps).requestPermission())
      .expectSession("cli", { state: "waiting" })
      .step("cli", (agent) => agent.as(CodexSteps).approve())
      .expectSession("cli", { state: "working" })
      .step("cli", (agent) => agent.as(CodexSteps).completeTurn())
      .expectSession("cli", { state: "done" })
      .step("cli", (agent) => agent.as(CodexSteps).exit())
      .expectSession("cli", undefined)
      .run();
    await expect(play).resolves.toBeUndefined();
  });
});
