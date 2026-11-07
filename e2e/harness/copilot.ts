import { AgentSteps } from "./agent-steps.js";
import type { Operation } from "./recording.js";

/**
 * The version of Copilot that the events come from. No shape file exists yet, because this project has no real
 * `events.jsonl` file of Copilot. The events follow `src/server/copilot.ts` and its tests.
 */
export const copilotFixtureVersion = "unverified";

const copilotProcessName = "copilot";
// The hub finds the session through the file `inuse.<pid>.hold`, which the process holds open.
const sessionDirectory = "{COPILOT_HOME}/session-state/{SESSION}";
export const copilotHoldPath = `${sessionDirectory}/inuse.{PID}.hold`;
export const copilotEventsPath = `${sessionDirectory}/events.jsonl`;
const defaultRequestIdentifier = "request-1";

export interface CopilotOptions {
  version?: string;
  /** The project folder. It is `{PROJECT_1}`, a folder in the temporary folder, when it is missing. */
  project?: string;
  model?: string;
}

/** The agent definition. The scenario uses it to start the process and to find the session in the hub. */
export interface CopilotAgent {
  kind: "copilot";
  version: string;
  processName: string;
  sessionIdentifier(sessionUuid: string): string;
  sessionIdentifierTemplate: string;
  steps: CopilotSteps;
}

export class CopilotSteps extends AgentSteps {
  constructor(
    private readonly agentKey: string,
    private readonly options: CopilotOptions,
  ) {
    super();
  }

  /** Starts the process, holds the `inuse` file open, and writes the first event. The session state is starting. */
  spawn(): Operation[] {
    return [
      { operation: "spawn", agent: this.agentKey, processName: copilotProcessName },
      { operation: "holdOpen", agent: this.agentKey, path: copilotHoldPath },
      this.event("session.start", { selectedModel: this.options.model ?? "copilot-model", context: { cwd: this.options.project ?? "{PROJECT_1}" } }),
    ];
  }

  /** The user sends a prompt. The session state is working. */
  startTurn(): Operation[] {
    return [this.event("user.message", {}), this.event("assistant.turn_start", {})];
  }

  /** The agent asks for a permission. The session state is waiting. */
  requestPermission(overrides: { requestId?: string } = {}): Operation[] {
    return [this.event("permission.requested", { requestId: overrides.requestId ?? defaultRequestIdentifier })];
  }

  /** The user answers. The session state is working again. */
  approve(overrides: { requestId?: string } = {}): Operation[] {
    return [this.event("permission.completed", { requestId: overrides.requestId ?? defaultRequestIdentifier })];
  }

  /** The turn ends. The session state is done. */
  completeTurn(): Operation[] {
    return [this.event("assistant.turn_end", {})];
  }

  /** The session ends in a clean way. The session state is done and the session is ended. */
  shutdown(): Operation[] {
    return [this.event("session.shutdown", {})];
  }

  /** The harness stops the process. The next scan of the hub ends the session. */
  exit(): Operation[] {
    return [{ operation: "exit", agent: this.agentKey }];
  }

  private event(type: string, data: Record<string, unknown>): Operation {
    return { operation: "append", agent: this.agentKey, path: copilotEventsPath, content: { type, timestamp: "{NOW}", data } };
  }
}

/** Makes the definition of a Copilot agent in a terminal. */
export function copilot(options: CopilotOptions = {}): (agentKey: string) => CopilotAgent {
  return (agentKey) => ({
    kind: "copilot",
    version: options.version ?? copilotFixtureVersion,
    processName: copilotProcessName,
    sessionIdentifier: (sessionUuid) => `copilot:${sessionUuid}`,
    sessionIdentifierTemplate: "copilot:{SESSION}",
    steps: new CopilotSteps(agentKey, options),
  });
}
