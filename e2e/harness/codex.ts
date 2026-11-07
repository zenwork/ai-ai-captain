import { AgentSteps } from "./agent-steps.js";
import type { Operation } from "./recording.js";
import { findKeyDifferences, type ShapeCatalog, type ShapeKey } from "./shape.js";

/** The version of Codex that the shape file in `e2e/fixtures/codex/` comes from. */
export const codexFixtureVersion = "0.162.1";

const codexProcessName = "codex";
// The hub finds the lock file and the rollout file by their names. The folder with the date can be any date.
export const codexLockPath = "{CODEX_HOME}/thread-writer-locks/{SESSION}.lock";
export const codexRolloutPath = "{CODEX_HOME}/sessions/2026/11/07/rollout-2026-11-07T10-00-00-{SESSION}.jsonl";
const defaultTurnIdentifier = "turn-1";
const defaultCallIdentifier = "call-1";
const permissionRequestName = "request_user_input";

export interface CodexOptions {
  /** The version of Codex that the fixtures come from. The default is the version of the shape file. */
  version?: string;
  /** The project folder. It is `{PROJECT_1}`, a folder in the temporary folder, when it is missing. */
  project?: string;
  model?: string;
}

export interface TokenCountOverrides {
  /** The tokens that the session used up to now. */
  total?: number;
  /** The tokens of the last request. The context percent comes from this value. */
  last?: number;
  contextWindow?: number;
}

/** The agent definition. The scenario uses it to start the process and to find the session in the hub. */
export interface CodexAgent {
  kind: "codex";
  version: string;
  processName: string;
  /** The identifier that the hub gives to a session of this agent. */
  sessionIdentifier(sessionUuid: string): string;
  /** The text of the identifier with a placeholder, for a recording. */
  sessionIdentifierTemplate: string;
  steps: CodexSteps;
}

export class CodexSteps extends AgentSteps {
  constructor(
    private readonly agentKey: string,
    private readonly options: CodexOptions,
  ) {
    super();
  }

  /**
   * Starts the process. A real Codex process holds the lock file and the rollout file open, and the hub finds
   * the session through these open files. The first event of the rollout names the session.
   */
  spawn(): Operation[] {
    return [
      { operation: "spawn", agent: this.agentKey, processName: codexProcessName },
      { operation: "holdOpen", agent: this.agentKey, path: codexLockPath },
      { operation: "holdOpen", agent: this.agentKey, path: codexRolloutPath },
      this.event("session_meta", {
        session_id: "{SESSION}",
        id: "{SESSION}",
        timestamp: "{NOW}",
        cwd: this.options.project ?? "{PROJECT_1}",
        cli_version: this.options.version ?? codexFixtureVersion,
      }),
    ];
  }

  /** Writes the settings of a turn: the project and the model. */
  turnContext(overrides: { model?: string; turnId?: string } = {}): Operation[] {
    return [
      this.event("turn_context", {
        cwd: this.options.project ?? "{PROJECT_1}",
        approval_policy: "on-request",
        sandbox_policy: { type: "workspace-write" },
        model: overrides.model ?? this.options.model ?? "codex-model",
        turn_id: overrides.turnId ?? defaultTurnIdentifier,
      }),
    ];
  }

  /** The user sends a prompt. The session state is working. */
  startTurn(overrides: { turnId?: string } = {}): Operation[] {
    return [this.eventMessage("task_started", { turn_id: overrides.turnId ?? defaultTurnIdentifier })];
  }

  /** Writes the token use. The hub shows the tokens and the percent of the context window. */
  tokenCount(overrides: TokenCountOverrides = {}): Operation[] {
    return [
      this.eventMessage("token_count", {
        info: {
          total_token_usage: { total_tokens: overrides.total ?? 12_400 },
          last_token_usage: { total_tokens: overrides.last ?? 12_400 },
          model_context_window: overrides.contextWindow ?? 200_000,
        },
      }),
    ];
  }

  /** The agent asks the user a question or for a permission. The session state is waiting. */
  requestPermission(overrides: { callId?: string } = {}): Operation[] {
    return [
      this.event("response_item", {
        type: "function_call",
        name: permissionRequestName,
        arguments: "{}",
        call_id: overrides.callId ?? defaultCallIdentifier,
      }),
    ];
  }

  /** The user answers. The session state is working again. */
  approve(overrides: { callId?: string } = {}): Operation[] {
    return [this.event("response_item", { type: "function_call_output", call_id: overrides.callId ?? defaultCallIdentifier, output: "{}" })];
  }

  /** The turn ends. The session state is done. */
  completeTurn(overrides: { turnId?: string } = {}): Operation[] {
    return [this.eventMessage("task_complete", { turn_id: overrides.turnId ?? defaultTurnIdentifier })];
  }

  /** The process closes the lock file. A scenario can examine what the hub does when the lock is gone but the process stays. */
  releaseLock(): Operation[] {
    return [{ operation: "release", agent: this.agentKey, path: codexLockPath }];
  }

  /** The harness stops the process. The next scan of the hub ends the session. */
  exit(): Operation[] {
    return [{ operation: "exit", agent: this.agentKey }];
  }

  private eventMessage(type: string, payload: Record<string, unknown>): Operation {
    return this.event("event_msg", { type, ...payload });
  }

  private event(type: string, payload: Record<string, unknown>): Operation {
    return { operation: "append", agent: this.agentKey, path: codexRolloutPath, content: { timestamp: "{NOW}", type, payload } };
  }
}

/** Makes the definition of a Codex agent in a terminal. */
export function codex(options: CodexOptions = {}): (agentKey: string) => CodexAgent {
  return (agentKey) => ({
    kind: "codex",
    version: options.version ?? codexFixtureVersion,
    processName: codexProcessName,
    sessionIdentifier: (sessionUuid) => `codex:${sessionUuid}`,
    sessionIdentifierTemplate: "codex:{SESSION}",
    steps: new CodexSteps(agentKey, options),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Finds what is different between a line of a rollout file and the shapes of a real rollout file.
 * The envelope of each line and the payload of its event type must agree with the catalog.
 */
export function findRolloutLineDifferences(line: Record<string, unknown>, catalog: ShapeCatalog): string[] {
  // The shapes come from many files, so the order of the keys is not checked.
  const check = (value: unknown, name: string): string[] => {
    const keys = catalog.shapes[name] as ShapeKey[] | undefined;
    if (!keys) return [`The shape file has no shape named ${name}`];
    if (!isRecord(value)) return [`${name} must be an object`];
    return findKeyDifferences(value, keys, name, { checkOrder: false });
  };
  const payload = isRecord(line.payload) ? line.payload : {};
  const payloadType = typeof payload.type === "string" ? payload.type : "-";
  const differences = [...check(line, "envelope"), ...check(payload, `${String(line.type)}/${payloadType} payload`)];
  const info = payload.info;
  if (payloadType === "token_count" && isRecord(info)) {
    differences.push(...check(info, "event_msg/token_count payload.info"));
    differences.push(...check(info.total_token_usage, "event_msg/token_count payload.info.total_token_usage"));
    differences.push(...check(info.last_token_usage, "event_msg/token_count payload.info.last_token_usage"));
  }
  return differences;
}
