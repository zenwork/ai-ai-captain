import { CopilotSessionState } from "../../src/server/copilot.js";
import { copilot, copilotEventsPath } from "../../e2e/harness/copilot.js";
import type { Recording } from "../../e2e/harness/recording.js";
import {
  appendTo,
  assembleRecording,
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
  let lastTimestamp = 0;
  for (const object of parseJsonObjects(eventsText)) {
    lastTimestamp = timestampMilliseconds(object.timestamp) ?? lastTimestamp;
    const kept = keepEvent(object, requests, tools);
    if (kept) events.push({ timestampMilliseconds: lastTimestamp, line: kept });
  }
  const reducer = new CopilotSessionState();
  const definition = copilot()("cli");
  return assembleRecording({
    agent: "copilot",
    agentVersion: undefined,
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
