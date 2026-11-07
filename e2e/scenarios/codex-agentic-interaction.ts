import { codex } from "../harness/codex.js";
import { scenario, type ScenarioBuilder } from "../harness/scenario.js";

const thinkingDuration = "5s";
const questionCallIdentifier = "call-question";
const permissionCallIdentifier = "call-permission";
const recoveryTurnIdentifier = "turn-2";

export interface AgenticInteractionOptions {
  /** The time that the agent thinks. The sandbox uses the default of 5 seconds. A test sets a short time. */
  thinking?: string;
}

/**
 * One Codex session with the interactions of a real agent session, in this order:
 * think, ask a multiple choice question, think, fail and recover, ask for a permission, and finish.
 * The hub gives the same state WAITING to a question and to a permission.
 */
export function codexAgenticInteraction(options: AgenticInteractionOptions = {}): ScenarioBuilder {
  const thinking = options.thinking ?? thinkingDuration;
  return (
    scenario("codex agentic interaction", { cli: codex({ model: "codex-model" }) })
      .step("cli", (agent) => agent.spawn())
      .step("cli", (agent) => agent.turnContext())
      .step("cli", (agent) => agent.startTurn())
      // The agent thinks.
      .expectSession("cli", { harness: "codex-cli", state: "working" })
      .wait(thinking)
      .expectSession("cli", { state: "working" })
      // The agent stops to ask a blocking question.
      .step("cli", (agent) => agent.requestPermission({ callId: questionCallIdentifier }))
      .expectSession("cli", { state: "waiting" })
      .wait(thinking)
      .expectSession("cli", { state: "waiting" })
      // The user answers. The agent thinks again.
      .step("cli", (agent) => agent.approve({ callId: questionCallIdentifier }))
      .expectSession("cli", { state: "working" })
      .wait(thinking)
      .expectSession("cli", { state: "working" })
      // The turn fails. The session stays open and a new turn starts.
      .step("cli", (agent) => agent.failTurn())
      .expectSession("cli", { state: "failed" })
      .wait(thinking)
      .step("cli", (agent) => agent.startTurn({ turnId: recoveryTurnIdentifier }))
      .expectSession("cli", { state: "working" })
      // The agent stops to ask for a permission.
      .step("cli", (agent) => agent.requestPermission({ callId: permissionCallIdentifier }))
      .expectSession("cli", { state: "waiting" })
      .wait(thinking)
      .step("cli", (agent) => agent.approve({ callId: permissionCallIdentifier }))
      .expectSession("cli", { state: "working" })
      // The turn ends.
      .step("cli", (agent) => agent.completeTurn({ turnId: recoveryTurnIdentifier }))
      .expectSession("cli", { state: "done" })
      .step("cli", (agent) => agent.exit())
      .expectSession("cli", undefined)
  );
}

/** The sandbox plays this scenario. Each wait gives people time to see the state on a deck. */
export const scenarios: ScenarioBuilder[] = [codexAgenticInteraction()];
