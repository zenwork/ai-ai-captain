import { junieEventState } from "../../src/server/junie.js";
import { junie } from "../../e2e/harness/junie.js";
import type { Recording } from "../../e2e/harness/recording.js";
import { assembleRecording, objectField, parseJsonObjects, textField, type ExportedEvent } from "./recording-export.js";

// The hub reads the text `"state":"<STATE>","agentEvent"`. The export keeps only a state name of this form.
const stateNamePattern = /^[A-Z_]{1,40}$/;

const statePhrases: Record<string, string> = {
  IN_PROGRESS: "task is in progress",
  INPUT_REQUIRED: "Junie asks the user for input",
  COMPLETED: "task is complete",
  FAILED: "task has failed",
};

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Makes a recording from the text of a Junie `events.jsonl` file. The recording keeps the state names and the time
 * between them. It does not stop the mock IDE, because a real IntelliJ IDEA on the computer keeps the session visible.
 */
export function exportJunieRecording(eventsText: string): Recording {
  const events: ExportedEvent[] = [];
  let lastTimestamp = 0;
  let lastState: string | undefined;
  for (const object of parseJsonObjects(eventsText)) {
    lastTimestamp = numberValue(object.timestampMs) ?? lastTimestamp;
    if (object.kind !== "SessionA2uxEvent") continue;
    const state = textField(objectField(object.event).state);
    if (!state || !stateNamePattern.test(state) || state === lastState) continue;
    lastState = state;
    events.push({ timestampMilliseconds: lastTimestamp, line: { state } });
  }
  const steps = junie()("ide").steps;
  return assembleRecording({
    agent: "junie",
    agentVersion: undefined,
    preamble: steps.spawn(),
    toOperation: (line) => steps.stateEvent(textField(line.state) ?? ""),
    sessionTemplate: junie()("ide").sessionIdentifierTemplate,
    events,
    describeEvent: (line) => statePhrases[textField(line.state) ?? ""],
    endWithExit: false,
    stateAfter: (line) => junieEventState(textField(line.state)),
  });
}
