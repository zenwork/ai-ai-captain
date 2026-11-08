import { CopilotSessionState } from "../../src/server/copilot.js";
import { copilot, copilotEventsPath } from "../../e2e/harness/copilot.js";
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
// These events change the state of the session. The export drops all other events.
const stateEventTypes = new Set([
  "session.start",
  "session.resume",
  "session.shutdown",
  "session.error",
  "session.idle",
  "session.task_complete",
  "session.cancelled",
  "user.message",
  "assistant.turn_start",
  "assistant.turn_end",
  "assistant.message",
  "tool.execution_start",
  "tool.execution_complete",
  "permission.requested",
  "permission.completed",
]);
// The hub treats a tool that asks the user as a request. The tool name is the only content that the export keeps.
const userInputTools = new Set(["ask_user", "exit_plan_mode"]);

// The phrases are fixed. They name the kind of event and never show its content.
const eventPhrases: Record<string, string> = {
  "session.start": "start of the session",
  "session.resume": "resume of the session",
  "session.shutdown": "shutdown of the session",
  "session.error": "error of the session",
  "session.idle": "idle session",
  "session.task_complete": "end of the task",
  "session.cancelled": "cancel by the user",
  "user.message": "prompt from the user",
  "assistant.turn_start": "start of a turn",
  "assistant.turn_end": "end of a turn",
  "assistant.message": "agent message",
  "tool.execution_start": "start of a tool call",
  "tool.execution_complete": "end of a tool call",
  "permission.requested": "permission request to the user",
  "permission.completed": "answer to a permission request",
};

function describeEvent(kept: JsonObject): string | undefined {
  const type = textField(kept.type) ?? "";
  const data = objectField(kept.data);
  if (type === "tool.execution_start" && textField(data.toolName) === "ask_user") return "question from the agent to the user";
  if (type === "tool.execution_start" && textField(data.toolName) === "exit_plan_mode") return "plan approval request to the user";
  if (type === "tool.execution_complete" && data.toolCallId !== undefined) return "answer to a question of the agent";
  return eventPhrases[type];
}

function line(type: string, data: JsonObject): JsonObject {
  return { type, timestamp: placeholderTimestamp, data };
}

function keepEvent(event: JsonObject, requests: IdentifierAliases, tools: IdentifierAliases): JsonObject | undefined {
  const type = textField(event.type);
  if (!type || !stateEventTypes.has(type)) return undefined;
  const data = objectField(event.data);
  if (type === "permission.requested" || type === "permission.completed") {
    const requestId = requests.assign(data.requestId);
    return line(type, requestId ? { requestId } : {});
  }
  if (type === "tool.execution_start") {
    const toolName = textField(data.toolName) ?? "";
    const toolCallId = userInputTools.has(toolName) ? tools.assign(data.toolCallId) : undefined;
    return line(type, toolCallId ? { toolName, toolCallId } : {});
  }
  if (type === "tool.execution_complete") {
    // Keep the identifier only for a call that asked the user.
    const toolCallId = tools.find(data.toolCallId);
    return line(type, toolCallId ? { toolCallId } : {});
  }
  return line(type, {});
}

/** Makes a recording from the text of a Copilot events file. The recording has the sequence of events and nothing else. */
export function exportCopilotRecording(eventsText: string): Recording {
  const requests = new IdentifierAliases("request");
  const tools = new IdentifierAliases("tool");
  const events: ExportedEvent[] = [];
  const objects = parseJsonObjects(eventsText);
  const dataOf = (type: string): JsonObject[] => objects.filter((object) => object.type === type).map((object) => objectField(object.data));
  let lastTimestamp = 0;
  for (const object of objects) {
    lastTimestamp = timestampMilliseconds(object.timestamp) ?? lastTimestamp;
    const kept = keepEvent(object, requests, tools);
    if (kept) events.push({ timestampMilliseconds: lastTimestamp, line: kept });
  }
  const reducer = new CopilotSessionState();
  const definition = copilot()("cli");
  return assembleRecording({
    agent: "copilot",
    agentVersion: firstValue(dataOf("session.start"), (data) => data.copilotVersion),
    model: firstValue(dataOf("session.auto_mode_resolved"), (data) => data.chosenModel) ?? firstValue(dataOf("session.model_change"), (data) => data.newModel),
    settings: {
      agentMode: firstValue(dataOf("assistant.turn_start"), (data) => data.agentMode),
      permissionMode: firstValue(dataOf("permission.requested"), (data) => data.permissionMode),
    },
    describeEvent,
    preamble: definition.steps.spawn().slice(0, 2),
    toOperation: appendTo(copilotEventsPath),
    sessionTemplate: definition.sessionIdentifierTemplate,
    events,
    stateAfter: (kept, milliseconds) => {
      reducer.apply({ ...kept, timestamp: new Date(milliseconds).toISOString() });
      return reducer.state;
    },
  });
}
