/** The base of the step classes of all agents. */
export abstract class AgentSteps {
  /**
   * Gives these steps as the steps of one agent kind, for example `agent.as(CodexSteps)`.
   * It stops with an error when the agent is another kind. The check is a real type check, so no cast is necessary.
   */
  as<Steps extends AgentSteps>(stepsClass: abstract new (...parameters: never[]) => Steps): Steps {
    if (this instanceof stepsClass) return this;
    throw new Error(`These steps are not the steps of ${stepsClass.name}`);
  }
}
