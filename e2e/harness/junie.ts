import { AgentSteps } from "./agent-steps.js";
import type { Operation } from "./recording.js";

export const junieFixtureVersion = "unverified";

// Junie runs inside IntelliJ IDEA. The hub finds the IDE by this path, and the path exists on macOS only.
const ideProcessName = "IntelliJ IDEA.app/Contents/MacOS/idea";
const sessionDirectory = "{JUNIE_HOME}/session-{SESSION}";
export const junieEventsPath = `${sessionDirectory}/events.jsonl`;
const indexPath = "{JUNIE_HOME}/index.jsonl";
const instancePath = "{JETBRAINS_INSTANCES}/idea_{PID}.json";
const defaultTaskIdentifier = "task-1";

/** The IDE path exists on macOS only, so the Junie simulator works on macOS only. */
export const isJunieSimulationSupported = process.platform === "darwin";

export interface JunieOptions {
  version?: string;
  /** The project folder. It is `{PROJECT_1}`, a folder in the temporary folder, when it is missing. */
  project?: string;
}

/** The agent definition. The scenario uses it to start the process and to find the session in the hub. */
export interface JunieAgent {
  kind: "junie";
  version: string;
  processName: string;
  sessionIdentifier(sessionUuid: string): string;
  sessionIdentifierTemplate: string;
  steps: JunieSteps;
}

export class JunieSteps extends AgentSteps {
  constructor(
    private readonly agentKey: string,
    private readonly options: JunieOptions,
  ) {
    super();
  }

  /**
   * Starts the fake IDE, registers the open project as IntelliJ IDEA does, and adds the session to the index.
   * The session state is unknown until the first task event.
   */
  spawn(): Operation[] {
    return [
      { operation: "spawn", agent: this.agentKey, processName: ideProcessName },
      {
        operation: "write",
        agent: this.agentKey,
        path: instancePath,
        content: { schema_version: 2, pid: "{PID}", project_path: this.options.project ?? "{PROJECT_1}" },
      },
      this.line(junieEventsPath, { kind: "UserPromptEvent", requestId: "request-1", timestampMs: "{NOW_MS}" }),
      this.line(indexPath, {
        sessionId: "session-{SESSION}",
        createdAt: "{NOW_MS}",
        updatedAt: "{NOW_MS}",
        projectDir: this.options.project ?? "{PROJECT_1}",
      }),
    ];
  }

  /** The task runs. The session state is working. */
  startTask(overrides: { taskId?: string } = {}): Operation[] {
    return [this.stateEvent("IN_PROGRESS", overrides.taskId)];
  }

  /** The task needs an answer from the user. The session state is waiting. */
  requestInput(overrides: { taskId?: string } = {}): Operation[] {
    return [this.stateEvent("INPUT_REQUIRED", overrides.taskId)];
  }

  /** The task ends. The session state is done. */
  completeTask(overrides: { taskId?: string } = {}): Operation[] {
    return [this.stateEvent("COMPLETED", overrides.taskId)];
  }

  /** The task fails. The session state is failed. */
  failTask(overrides: { taskId?: string } = {}): Operation[] {
    return [this.stateEvent("FAILED", overrides.taskId)];
  }

  /** The harness stops the fake IDE. The next scan of the hub removes the session. */
  exit(): Operation[] {
    return [{ operation: "exit", agent: this.agentKey }];
  }

  /** Writes a state event with any state name. The hub shows `unknown` for a state that it does not know, for example a new state of a later Junie version. */
  stateEvent(state: string, taskId = defaultTaskIdentifier): Operation {
    // The hub reads the text `"state":"<STATE>","agentEvent"`, so the key order matters.
    return this.line(junieEventsPath, {
      kind: "SessionA2uxEvent",
      event: { state, agentEvent: { kind: "TaskState", agent: { kind: "MainAgent", id: "main" } } },
      taskId,
      timestampMs: "{NOW_MS}",
    });
  }

  private line(path: string, content: Record<string, unknown>): Operation {
    return { operation: "append", agent: this.agentKey, path, content };
  }
}

/** Makes the definition of a Junie agent in IntelliJ IDEA. */
export function junie(options: JunieOptions = {}): (agentKey: string) => JunieAgent {
  return (agentKey) => ({
    kind: "junie",
    version: options.version ?? junieFixtureVersion,
    processName: ideProcessName,
    sessionIdentifier: (sessionUuid) => `junie:session-${sessionUuid}`,
    sessionIdentifierTemplate: "junie:session-{SESSION}",
    steps: new JunieSteps(agentKey, options),
  });
}
