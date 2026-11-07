import assert from "node:assert/strict";
import { claudeCode, ClaudeCodeSteps } from "../harness/claude-code.js";
import { scenario, type ScenarioBuilder } from "../harness/scenario.js";

export interface LifecycleOptions {
  /** With `true`, the scenario opens the virtual deck in a headless browser and examines it. The sandbox sets `false`. */
  checkDeck: boolean;
  /** A time to wait after each state, for example "3s". People can then see each state on a deck. */
  pause?: string;
}

/** The life cycle of one Claude Code session in a terminal: working, waiting, working, done, and then the process stops. */
export function claudeCodeLifecycle(options: LifecycleOptions = { checkDeck: true }): ScenarioBuilder {
  const builder = scenario("claude code life cycle").agent("cli", claudeCode({}));
  if (options.checkDeck) builder.deck({ viewport: { width: 900, height: 300 }, clock: "manual" });
  const pause = (): void => {
    if (options.pause) builder.wait(options.pause);
  };
  builder
    .step("cli", (agent) => agent.as(ClaudeCodeSteps).spawn({ status: "busy" }))
    .expectSession("cli", { source: "claude-local", harness: "claude-cli", state: "working" });
  pause();
  builder.step("cli", (agent) => agent.as(ClaudeCodeSteps).status("permission_required")).expectSession("cli", { state: "waiting" });
  pause();
  builder.step("cli", (agent) => agent.as(ClaudeCodeSteps).status("busy")).expectSession("cli", { state: "working" });
  pause();
  builder.step("cli", (agent) => agent.as(ClaudeCodeSteps).status("idle")).expectSession("cli", { state: "done" });
  pause();
  if (options.checkDeck) {
    builder.expectDeck((deck) => {
      assert.equal(deck.key(1).kind, "session");
      assert.equal(deck.key(1).state, "done");
      assert.ok(deck.key(1).texts.includes("DONE"), "The key must show the label DONE");
    });
  }
  return builder.step("cli", (agent) => agent.as(ClaudeCodeSteps).exit()).expectSession("cli", undefined);
}

/** The sandbox plays these scenarios. Each state stays for a few seconds, so that people can see it on a deck. */
export const scenarios: ScenarioBuilder[] = [claudeCodeLifecycle({ checkDeck: false, pause: "4s" })];
