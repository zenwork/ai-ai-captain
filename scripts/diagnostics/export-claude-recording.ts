import { claudeRegistryState } from "../../src/server/claude.js";
import { claudeCode, type ClaudeCodeStatus } from "../../e2e/harness/claude-code.js";
import type { Recording } from "../../e2e/harness/recording.js";
import { assembleRecording, firstValue, objectField, parseJsonObjects, textField, timestampMilliseconds, type ExportedEvent } from "./recording-export.js";

const promptStatus: ClaudeCodeStatus = "busy";
const turnEndStatus: ClaudeCodeStatus = "idle";

/** True for a line that holds only tool results. Such a line does not start a turn. */
function isToolResultOnly(content: unknown): boolean {
  if (!Array.isArray(content) || content.length === 0) return false;
  return content.every((item) => textField(objectField(item).type) === "tool_result");
}

/** Gives the status that a transcript line causes, or nothing. The export reads the line type and the stop reason only. */
function statusOf(line: Record<string, unknown>): ClaudeCodeStatus | undefined {
  if (line.isSidechain === true) return undefined;
  const message = objectField(line.message);
  if (line.type === "user") return isToolResultOnly(message.content) ? undefined : promptStatus;
  if (line.type === "assistant" && message.stop_reason === "end_turn") return turnEndStatus;
  if (line.type === "system" && line.subtype === "turn_duration") return turnEndStatus;
  return undefined;
}

/**
 * Makes a recording from a sequence of registration statuses. The mock agent writes each status to the registration
 * file, as Claude Code does. The expected states come from the status mapping of the hub.
 */
const statusPhrases: Record<string, string> = {
  busy: "agent starts to work",
  idle: "agent is idle",
  permission_required: "permission request to the user",
};

export interface ClaudeRecordingContext {
  model?: string | undefined;
  settings?: Record<string, unknown>;
}

export function claudeRecordingFromStatuses(events: ExportedEvent[], version: string | undefined, context: ClaudeRecordingContext = {}): Recording {
  const steps = claudeCode({})("cli").steps;
  return assembleRecording({
    agent: "claude-code",
    agentVersion: version,
    preamble: steps.spawn({ status: turnEndStatus }),
    toOperation: (line) => {
      const [operation] = steps.observedStatus(textField(line.status) ?? "");
      return operation;
    },
    sessionTemplate: "claude:{SESSION}",
    describeEvent: (line) => statusPhrases[textField(line.status) ?? ""],
    model: context.model,
    ...(context.settings ? { settings: context.settings } : {}),
    events,
    stateAfter: (line) => claudeRegistryState(textField(line.status)),
  });
}

/**
 * Makes a recording from the text of a Claude Code transcript. The registration file has no history, so the export
 * derives the status from the transcript: a prompt gives `busy`, and the end of a turn gives `idle`.
 * The transcript has no record of a permission request. Thus the recording never has the state `waiting`.
 * To record the real statuses, watch the registration file while the session runs (`watch-claude-session.ts`).
 */
export function exportClaudeRecording(transcriptText: string): Recording {
  const objects = parseJsonObjects(transcriptText);
  const events: ExportedEvent[] = [];
  let lastTimestamp = 0;
  let lastStatus: ClaudeCodeStatus | undefined;
  for (const object of objects) {
    lastTimestamp = timestampMilliseconds(object.timestamp) ?? lastTimestamp;
    const status = statusOf(object);
    if (!status || status === lastStatus) continue;
    lastStatus = status;
    events.push({ timestampMilliseconds: lastTimestamp, line: { status } });
  }
  const version = objects.map((object) => textField(object.version)).find((text) => text !== undefined);
  const messages = objects.map((object) => objectField(object.message));
  return claudeRecordingFromStatuses(events, version, {
    model: firstValue(messages, (message) => message.model),
    settings: {
      permissionMode: firstValue(objects, (object) => object.permissionMode),
      effort: firstValue(objects, (object) => object.effort),
    },
  });
}
