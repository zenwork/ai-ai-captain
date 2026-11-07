import { describe, expect, it } from "vitest";
import { isAgentSimulationSupported } from "../harness/agent-process.js";
import { codexAgenticInteraction } from "./codex-agentic-interaction.js";

describe.skipIf(!isAgentSimulationSupported)("codex agentic interaction", () => {
  it("shows each state of the interaction in order", async () => {
    await expect(codexAgenticInteraction({ thinking: "200ms" }).run()).resolves.toBeUndefined();
  });
});
