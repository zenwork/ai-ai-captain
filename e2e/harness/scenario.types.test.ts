import { describe, expect, it } from "vitest";
import { claudeCode } from "./claude-code.js";
import { codex } from "./codex.js";
import { scenario } from "./scenario.js";

describe("the types of the scenario builder", () => {
  it("gives the steps of each agent key", () => {
    const builder = scenario("two agents", { cli: codex(), helper: claudeCode({}) });
    builder.step("cli", (agent) => agent.startTurn());
    builder.step("helper", (agent) => agent.status("busy"));
    expect(builder.toRecording().timeline).toHaveLength(2);
  });

  it("rejects a wrong agent key", () => {
    const builder = scenario("typed", { cli: codex() });
    // @ts-expect-error The scenario has no agent named "other".
    expect(() => builder.step("other", (agent) => agent.startTurn())).toThrow();
  });
});
