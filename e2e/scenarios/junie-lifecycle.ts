import { junie, JunieSteps } from "../harness/junie.js";
import { scenario, type ScenarioBuilder } from "../harness/scenario.js";

/** The life cycle of one Junie session in IntelliJ IDEA: working and then done. It works on macOS only. */
export function junieLifecycle(options: { pause?: string } = {}): ScenarioBuilder {
  const builder = scenario("junie life cycle").agent("ide", junie());
  const pause = (): void => {
    if (options.pause) builder.wait(options.pause);
  };
  builder.step("ide", (agent) => agent.as(JunieSteps).spawn());
  builder.step("ide", (agent) => agent.as(JunieSteps).startTask()).expectSession("ide", { source: "junie-local", harness: "intellij-ai", state: "working" });
  pause();
  builder.step("ide", (agent) => agent.as(JunieSteps).completeTask()).expectSession("ide", { state: "done" });
  pause();
  // No exit step: the hub also sees a real IntelliJ IDEA on the computer, and then it keeps the session as unverified.
  return builder;
}

/** The sandbox plays these scenarios. Each state stays for a few seconds, so that people can see it on a deck. */
export const scenarios: ScenarioBuilder[] = [junieLifecycle({ pause: "4s" })];
