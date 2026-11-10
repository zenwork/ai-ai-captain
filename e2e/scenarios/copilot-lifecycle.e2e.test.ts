import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isAgentSimulationSupported } from "../harness/agent-process.js";
import { scenario } from "../harness/scenario.js";
import { copilotLifecycle } from "./copilot-lifecycle.js";

describe.skipIf(!isAgentSimulationSupported)("copilot life cycle", () => {
  it("plays the recorded Copilot session", async () => {
    const recording = fileURLToPath(new URL("../fixtures/copilot/recording/copilot-00a99954.recording.json", import.meta.url));
    await scenario.fromRecording(recording).run();
  });

  it("walks through the life cycle", async () => {
    await expect(copilotLifecycle().run()).resolves.toBeUndefined();
  });
});
