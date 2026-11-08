import { describe, expect, it } from "vitest";
import { isAgentSimulationSupported } from "../harness/agent-process.js";
import { codexLifecycle } from "./codex-lifecycle.js";

describe.skipIf(!isAgentSimulationSupported)("codex life cycle", () => {
  it("walks through the life cycle", async () => {
    await expect(codexLifecycle().run()).resolves.toBeUndefined();
  });
});
