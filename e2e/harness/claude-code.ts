import type { Operation } from "./recording.js";

/** The version of Claude Code that the shape file in `e2e/fixtures/claude-code/` comes from. */
export const claudeCodeFixtureVersion = "2.1.319";

export interface ClaudeCodeOptions {
  /** The version of Claude Code that the fixtures come from. The default is the version of the shape file. */
  version?: string;
  /** The project folder. It is `{PROJECT_1}`, a folder in the temporary folder, when it is missing. */
  project?: string;
}

/** The statuses that the registration of Claude Code can have. The adapter reads them (`claudeRegistryState`). */
export type ClaudeCodeStatus = "starting" | "busy" | "needs_input" | "permission_required" | "idle";

const registrationPath = "{CLAUDE_HOME}/sessions/{PID}.json";
const claudeProcessName = "claude";

/** The agent definition. The scenario uses it to start the process and to find the session in the hub. */
export interface ClaudeCodeAgent {
  kind: "claude-code";
  version: string;
  processName: string;
  /** The identifier that the hub gives to a session of this agent. */
  sessionIdentifier(sessionUuid: string): string;
  /** The text of the identifier with a placeholder, for a recording. */
  sessionIdentifierTemplate: string;
  steps: ClaudeCodeSteps;
}

export class ClaudeCodeSteps {
  constructor(
    private readonly agentKey: string,
    private readonly options: ClaudeCodeOptions,
  ) {}

  /** Starts the process and writes the registration. */
  spawn(overrides: { status?: ClaudeCodeStatus } = {}): Operation[] {
    return [{ operation: "spawn", agent: this.agentKey, processName: claudeProcessName }, ...this.status(overrides.status ?? "busy")];
  }

  /** Writes the registration with a new status. This is what Claude Code does when its state changes. */
  status(status: ClaudeCodeStatus): Operation[] {
    return [{ operation: "write", agent: this.agentKey, path: registrationPath, content: this.registrationContent(status) }];
  }

  /** The harness stops the process. The next scan of the hub removes the session. */
  exit(): Operation[] {
    return [{ operation: "exit", agent: this.agentKey }];
  }

  readonly registration = {
    /** Writes a text in place of the registration, for edge cases such as a file that is cut off. */
    writeRaw: (text: string): Operation[] => [{ operation: "write", agent: this.agentKey, path: registrationPath, content: text }],
  };

  private registrationContent(status: ClaudeCodeStatus): Record<string, unknown> {
    return {
      pid: "{PID}",
      sessionId: "{SESSION}",
      cwd: this.options.project ?? "{PROJECT_1}",
      startedAt: "{T}",
      status,
    };
  }
}

/** Makes the definition of a Claude Code agent in a terminal. */
export function claudeCode(options: ClaudeCodeOptions): (agentKey: string) => ClaudeCodeAgent {
  return (agentKey) => ({
    kind: "claude-code",
    version: options.version ?? claudeCodeFixtureVersion,
    processName: claudeProcessName,
    sessionIdentifier: (sessionUuid) => `claude:${sessionUuid}`,
    sessionIdentifierTemplate: "claude:{SESSION}",
    steps: new ClaudeCodeSteps(agentKey, options),
  });
}
