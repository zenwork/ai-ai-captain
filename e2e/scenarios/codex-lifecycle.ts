import { codex, CodexSteps } from "../harness/codex.js";
import { scenario, type ScenarioBuilder } from "../harness/scenario.js";

/** The life cycle of one Codex session in a terminal: working, waiting, working, done, and then the process stops. */
export function codexLifecycle(options: { pause?: string } = {}): ScenarioBuilder {
  const builder = scenario("codex life cycle").agent("cli", codex({ model: "codex-model" }));
  const pause = (): void => {
    if (options.pause) builder.wait(options.pause);
  };
  builder
    .step("cli", (agent) => agent.as(CodexSteps).spawn())
    .step("cli", (agent) => agent.as(CodexSteps).turnContext())
    .step("cli", (agent) => agent.as(CodexSteps).startTurn())
    .expectSession("cli", { harness: "codex-cli", state: "working" });
  pause();
  builder.step("cli", (agent) => agent.as(CodexSteps).requestPermission()).expectSession("cli", { state: "waiting" });
  pause();
  builder.step("cli", (agent) => agent.as(CodexSteps).approve()).expectSession("cli", { state: "working" });
  pause();
  builder.step("cli", (agent) => agent.as(CodexSteps).completeTurn()).expectSession("cli", { state: "done" });
  pause();
  return builder.step("cli", (agent) => agent.as(CodexSteps).exit()).expectSession("cli", undefined);
}

/** The sandbox plays these scenarios. Each state stays for a few seconds, so that people can see it on a deck. */
export const scenarios: ScenarioBuilder[] = [codexLifecycle({ pause: "4s" })];
