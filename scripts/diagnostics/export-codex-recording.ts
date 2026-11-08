import { CodexSessionState } from "../../src/server/codex.js";
import { codex, codexRolloutPath } from "../../e2e/harness/codex.js";
import type { Recording } from "../../e2e/harness/recording.js";
import {
  appendTo,
  assembleRecording,
  firstValue,
  IdentifierAliases,
  objectField,
  parseJsonObjects,
  textField,
  timestampMilliseconds,
  type ExportedEvent,
  type JsonObject,
} from "./recording-export.js";

const placeholderTimestamp = "{NOW}";
const permissionRequestName = "request_user_input";
// The hub accepts this name with an optional prefix. The export writes the short form.
const permissionRequestPattern = /^(?:functions\.)?request_user_input$/;
const turnStartTypes = new Set(["task_started", "turn_started"]);
const turnEndTypes = new Set(["task_complete", "turn_complete", "turn_completed", "turn_aborted"]);
const failureTypes = new Set(["error", "turn_failed"]);

function describeEvent(kept: JsonObject): string | undefined {
  const payload = objectField(kept.payload);
  const payloadType = textField(payload.type) ?? "";
  if (kept.type === "session_meta") return "start of the session";
  if (turnStartTypes.has(payloadType)) return "start of a turn";
  if (turnEndTypes.has(payloadType)) return payloadType === "turn_aborted" ? "stop of a turn by the user" : "end of a turn";
  if (failureTypes.has(payloadType)) return "error in a turn";
  if (kept.type !== "response_item") return undefined;
  return payloadType.endsWith("_output") ? "answer to a question of the agent" : "question from the agent to the user";
}

function line(type: string, payload: JsonObject): JsonObject {
  return { timestamp: placeholderTimestamp, type, payload };
}

/**
 * Keeps the type of an event and the identifiers that the hub pairs. The export drops all other fields.
 * It drops the events that carry only content: messages, tool calls, token counts, and settings.
 */
function keepEvent(event: JsonObject, turns: IdentifierAliases, calls: IdentifierAliases): JsonObject | undefined {
  const payload = objectField(event.payload);
  const payloadType = textField(payload.type) ?? "";
  if (event.type === "session_meta") return line("session_meta", { session_id: "{SESSION}", id: "{SESSION}", timestamp: placeholderTimestamp });
  if (event.type === "event_msg") {
    if (turnStartTypes.has(payloadType) || turnEndTypes.has(payloadType)) {
      const turnId = turns.assign(payload.turn_id);
      return line("event_msg", { type: payloadType, ...(turnId ? { turn_id: turnId } : {}) });
    }
    if (failureTypes.has(payloadType)) return line("event_msg", { type: payloadType });
    return undefined;
  }
  if (event.type !== "response_item") return undefined;
  const isCall = payloadType === "function_call" || payloadType === "custom_tool_call";
  const isOutput = payloadType === "function_call_output" || payloadType === "custom_tool_call_output";
  if (isCall && permissionRequestPattern.test(textField(payload.name) ?? "")) {
    const callId = calls.assign(payload.call_id);
    if (!callId) return undefined;
    const argumentKey = payloadType === "function_call" ? "arguments" : "input";
    return line("response_item", { type: payloadType, name: permissionRequestName, [argumentKey]: "{}", call_id: callId });
  }
  const knownCallId = isOutput ? calls.find(payload.call_id) : undefined;
  if (knownCallId) return line("response_item", { type: payloadType, call_id: knownCallId, output: "{}" });
  return undefined;
}

/** Makes a recording from the text of a Codex rollout file. The recording has the sequence of events and nothing else. */
export function exportCodexRecording(rolloutText: string): Recording {
  const turns = new IdentifierAliases("turn");
  const calls = new IdentifierAliases("call");
  const objects = parseJsonObjects(rolloutText);
  const events: ExportedEvent[] = [];
  let lastTimestamp = 0;
  for (const object of objects) {
    lastTimestamp = timestampMilliseconds(object.timestamp) ?? lastTimestamp;
    const kept = keepEvent(object, turns, calls);
    if (kept) events.push({ timestampMilliseconds: lastTimestamp, line: kept });
  }
  const sessionMeta = objects.find((object) => object.type === "session_meta");
  const turnContexts = objects.filter((object) => object.type === "turn_context").map((object) => objectField(object.payload));
  const reducer = new CodexSessionState();
  const definition = codex()("cli");
  return assembleRecording({
    agent: "codex",
    agentVersion: textField(objectField(sessionMeta?.payload).cli_version),
    model: firstValue(turnContexts, (context) => context.model),
    settings: {
      reasoningEffort: firstValue(turnContexts, (context) => context.effort),
      approvalPolicy: firstValue(turnContexts, (context) => context.approval_policy),
      sandbox: firstValue(turnContexts, (context) => objectField(context.sandbox_policy).type),
    },
    describeEvent,
    preamble: definition.steps.spawn().slice(0, 3),
    toOperation: appendTo(codexRolloutPath),
    sessionTemplate: definition.sessionIdentifierTemplate,
    events,
    stateAfter: (kept, milliseconds) => {
      reducer.apply({ ...kept, timestamp: new Date(milliseconds).toISOString() });
      return reducer.state;
    },
  });
}
