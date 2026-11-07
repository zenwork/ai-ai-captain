import { copilot, CopilotSteps } from "../harness/copilot.js";
import { scenario, type ScenarioBuilder } from "../harness/scenario.js";

/** The life cycle of one Copilot session in a terminal: starting, working, waiting, working, done, and then the process stops. */
export function copilotLifecycle(options: { pause?: string } = {}): ScenarioBuilder {
  const builder = scenario("copilot life cycle").agent("cli", copilot({ model: "copilot-model" }));
  const pause = (): void => {
    if (options.pause) builder.wait(options.pause);
  };
  builder.step("cli", (agent) => agent.as(CopilotSteps).spawn()).expectSession("cli", { harness: "copilot-cli", state: "starting" });
  pause();
  builder.step("cli", (agent) => agent.as(CopilotSteps).startTurn()).expectSession("cli", { state: "working", model: "copilot-model" });
  pause();
  builder.step("cli", (agent) => agent.as(CopilotSteps).requestPermission()).expectSession("cli", { state: "waiting" });
  pause();
  builder.step("cli", (agent) => agent.as(CopilotSteps).approve()).expectSession("cli", { state: "working" });
  pause();
  builder.step("cli", (agent) => agent.as(CopilotSteps).completeTurn()).expectSession("cli", { state: "done" });
  pause();
  return builder.step("cli", (agent) => agent.as(CopilotSteps).exit()).expectSession("cli", undefined);
}

/** The sandbox plays these scenarios. Each state stays for a few seconds, so that people can see it on a deck. */
export const scenarios: ScenarioBuilder[] = [copilotLifecycle({ pause: "4s" })];
