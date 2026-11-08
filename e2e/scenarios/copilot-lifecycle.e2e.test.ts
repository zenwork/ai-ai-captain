import { describe, expect, it } from "vitest";
import { isAgentSimulationSupported } from "../harness/agent-process.js";
import { copilotLifecycle } from "./copilot-lifecycle.js";

describe.skipIf(!isAgentSimulationSupported)("copilot life cycle", () => {
  it("walks through the life cycle", async () => {
    await expect(copilotLifecycle().run()).resolves.toBeUndefined();
  });
});
