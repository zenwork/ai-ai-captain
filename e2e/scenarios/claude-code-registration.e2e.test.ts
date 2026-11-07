import { describe, expect, it } from "vitest";
import { isAgentSimulationSupported } from "../harness/agent-process.js";
import { claudeCode, ClaudeCodeSteps } from "../harness/claude-code.js";
import { scenario } from "../harness/scenario.js";

const futureRegistration = JSON.stringify({
  pid: "{PID}",
  sessionId: "{SESSION}",
  cwd: "{PROJECT_1}",
  startedAt: "{T}",
  status: "busy",
  futureKey: { nested: [1, 2, 3] },
  anotherFutureKey: "value",
})
  .replace('"{PID}"', "{PID}")
  .replace('"{T}"', "{T}");

describe.skipIf(!isAgentSimulationSupported)("claude code registration file", () => {
  it("tolerates keys that a newer version of Claude Code adds", async () => {
    await scenario("unknown registration keys")
      .agent("cli", claudeCode({}))
      .step("cli", (agent) => agent.as(ClaudeCodeSteps).spawn({ status: "idle" }))
      .expectSession("cli", { state: "done" })
      .step("cli", (agent) => agent.as(ClaudeCodeSteps).registration.writeRaw(futureRegistration))
      .expectSession("cli", { state: "working" })
      .run();
  });

  it("shows the state unknown with a safe error code when the registration is cut off", async () => {
    await scenario("registration cut off")
      .agent("cli", claudeCode({}))
      .step("cli", (agent) => agent.as(ClaudeCodeSteps).spawn({ status: "busy" }))
      .expectSession("cli", { state: "working" })
      .step("cli", (agent) => agent.as(ClaudeCodeSteps).registration.writeRaw('{"pid":{PID},"sessionId":"{SESSION}"'))
      .expectSession("cli", { state: "unknown", metadata: expect.objectContaining({ telemetryError: "REGISTRATION_UNREADABLE" }) })
      .step("cli", (agent) => agent.as(ClaudeCodeSteps).status("idle"))
      .expectSession("cli", { state: "done" })
      .run();
  });
});
