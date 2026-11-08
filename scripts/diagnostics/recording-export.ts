import { z } from "zod";
import { formatDurationMilliseconds } from "../../e2e/harness/duration.js";
import type { Operation, Recording, RecordingContext } from "../../e2e/harness/recording.js";
import { recordingFormatVersion } from "../../e2e/harness/recording.js";

/** The agent key in an exported recording. */
export const exportAgentKey = "cli";
const exitDelayMilliseconds = 1_000;
const versionPattern = /^[\w.+-]{1,40}$/;
const objectSchema = z.record(z.string(), z.unknown());

export type JsonObject = Record<string, unknown>;

/** One event that the export keeps. It holds the type, the time, and the aliased identifiers only. */
export interface ExportedEvent {
  timestampMilliseconds: number;
  line: JsonObject;
}

/** Reads a file with one JSON object in each line. A line that is not an object is skipped. */
export function parseJsonObjects(text: string): JsonObject[] {
  const objects: JsonObject[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = objectSchema.safeParse(JSON.parse(line));
      if (parsed.success) objects.push(parsed.data);
    } catch {
      // A cut-off last line is normal in a file that is still open.
    }
  }
  return objects;
}

/** Gives the value as an object, or an empty object. */
export function objectField(value: unknown): JsonObject {
  const parsed = objectSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

export function textField(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function timestampMilliseconds(value: unknown): number | undefined {
  const text = textField(value);
  if (text === undefined) return undefined;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Replaces the identifiers of a session with short names, for example `turn-1`.
 * The hub pairs a turn, a request, or a call with its end by identifier. The export keeps this pairing and nothing else.
 */
export class IdentifierAliases {
  private readonly aliases = new Map<string, string>();

  constructor(private readonly prefix: string) {}

  /** Gives the alias of an identifier. A new identifier gets the next number. */
  assign(identifier: unknown): string | undefined {
    const text = textField(identifier);
    if (!text) return undefined;
    const existing = this.aliases.get(text);
    if (existing) return existing;
    const created = `${this.prefix}-${String(this.aliases.size + 1)}`;
    this.aliases.set(text, created);
    return created;
  }

  /** Gives the alias of an identifier that the export saw before. */
  find(identifier: unknown): string | undefined {
    const text = textField(identifier);
    return text ? this.aliases.get(text) : undefined;
  }
}

/** Gives a function that appends a kept event as one line to a file. */
export function appendTo(path: string): (line: JsonObject) => Operation {
  return (line) => ({ operation: "append", agent: exportAgentKey, path, content: line });
}

// A setting value from a session is safe when it is a short word. A path or a sentence does not pass.
const safeValuePattern = /^[\w.:-]{1,40}$/;
const importantStates = new Set(["waiting", "done", "failed"]);
const maximumSummaryGroups = 6;
// The phrases are fixed. They never contain text from a session.
const statePhrases: Record<string, string> = {
  starting: "The session starts.",
  working: "The agent works.",
  waiting: "The session waits for the user.",
  done: "The agent has finished its turn.",
  failed: "The session has failed.",
};

/** Gives the value when it is a short word, or nothing. */
export function safeValue(value: unknown): string | undefined {
  return typeof value === "string" && safeValuePattern.test(value) ? value : undefined;
}

/** Keeps the settings that have a safe value. */
export function safeSettings(settings: Record<string, unknown>): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [name, value] of Object.entries(settings)) {
    const text = safeValue(value);
    if (text !== undefined) safe[name] = text;
  }
  return safe;
}

/** The first value that the function finds in the objects, or nothing. */
export function firstValue(objects: JsonObject[], find: (object: JsonObject) => unknown): string | undefined {
  for (const object of objects) {
    const text = safeValue(find(object));
    if (text !== undefined) return text;
  }
  return undefined;
}

function summarize(descriptions: string[]): string {
  const counts = new Map<string, number>();
  for (const description of descriptions) counts.set(description, (counts.get(description) ?? 0) + 1);
  const groups = [...counts].slice(-maximumSummaryGroups).map(([description, count]) => (count > 1 ? `${description} (${String(count)})` : description));
  return `Events since the previous state: ${groups.join(", ")}.`;
}

function describeState(state: string, descriptions: string[]): string | undefined {
  const phrase = statePhrases[state];
  if (phrase === undefined) return undefined;
  return descriptions.length > 0 ? `${phrase} ${summarize(descriptions)}` : phrase;
}

function contextOf(options: AssembleOptions, startMilliseconds: number): RecordingContext {
  // A time before the year 2000 means that the file had no time. Then the day of the export applies.
  const minimumMilliseconds = Date.UTC(2000, 0, 1);
  const dayMilliseconds = startMilliseconds >= minimumMilliseconds ? startMilliseconds : Date.now();
  const settings = options.settings ? safeSettings(options.settings) : {};
  return {
    recordedOn: new Date(dayMilliseconds).toISOString().slice(0, 10),
    ...(options.model ? { model: options.model } : {}),
    ...(Object.keys(settings).length > 0 ? { settings } : {}),
  };
}

export interface AssembleOptions {
  agent: string;
  /** The version text from the file. The export uses it only when it has a safe form. */
  agentVersion: string | undefined;
  /** The operations that start the process and open the files. They come from the steps of the simulator. */
  preamble: Operation[];
  /** Makes the operation that replays one kept event. */
  toOperation: (line: JsonObject) => Operation;
  sessionTemplate: string;
  events: ExportedEvent[];
  /** With `false`, the recording does not stop the process. The default is `true`. */
  endWithExit?: boolean;
  /** Applies one event to the state reducer of the hub and gives the new state. */
  stateAfter: (line: JsonObject, timestampMilliseconds: number) => string;
  /** Gives a short fixed phrase for an event, for example "agent message". It must not use content of the session. */
  describeEvent?: (line: JsonObject) => string | undefined;
  /** The model of the session. Only a short word is kept. */
  model?: string | undefined;
  /** High-level settings, for example the permission mode. Only short words are kept. */
  settings?: Record<string, unknown>;
}

// The hub polls the files. A state that ends in less time than this is not visible, so a replay cannot expect it.
const shortestVisibleStateMilliseconds = 500;

/** Removes the states that the next state replaces too fast for the hub to show. The last state stays. */
function withoutShortStates<Entry extends { offsetMilliseconds: number; state: string }>(states: Entry[]): Entry[] {
  const visible = states.filter((entry, index) => {
    const next = states[index + 1];
    return next === undefined || next.offsetMilliseconds - entry.offsetMilliseconds >= shortestVisibleStateMilliseconds;
  });
  // Removing a short state can leave two equal states in sequence. Only the first one counts.
  return visible.filter((entry, index) => entry.state !== visible[index - 1]?.state);
}

/** Makes a recording from the kept events. The expected states come from the state reducer of the hub. */
export function assembleRecording(options: AssembleOptions): Recording {
  const timeline: Recording["timeline"] = options.preamble.map((operation) => ({ ...operation }));
  const observedStates: { offsetMilliseconds: number; state: string; comment: string | undefined }[] = [];
  let descriptionsSinceChange: string[] = [];
  const startMilliseconds = options.events[0]?.timestampMilliseconds ?? 0;
  let offsetMilliseconds = 0;
  let previousState: string | undefined;
  for (const event of options.events) {
    offsetMilliseconds = Math.max(offsetMilliseconds, event.timestampMilliseconds - startMilliseconds);
    const offset = formatDurationMilliseconds(offsetMilliseconds);
    const description = options.describeEvent?.(event.line);
    if (description) descriptionsSinceChange.push(description);
    const state = options.stateAfter(event.line, event.timestampMilliseconds);
    const isImportant = state !== previousState && importantStates.has(state);
    timeline.push({ offset, ...options.toOperation(event.line), ...(isImportant && description ? { comment: description } : {}) });
    if (state === previousState) continue;
    observedStates.push({ offsetMilliseconds, state, comment: describeState(state, descriptionsSinceChange) });
    descriptionsSinceChange = [];
    previousState = state;
  }
  const expected: Recording["expected"] = withoutShortStates(observedStates).map((observed) => ({
    offset: formatDurationMilliseconds(observed.offsetMilliseconds),
    session: options.sessionTemplate,
    state: observed.state,
    ...(observed.comment ? { comment: observed.comment } : {}),
  }));
  if (options.endWithExit !== false) {
    const exitOffset = formatDurationMilliseconds(offsetMilliseconds + exitDelayMilliseconds);
    timeline.push({ offset: exitOffset, operation: "exit", agent: exportAgentKey });
    expected.push({ offset: exitOffset, session: options.sessionTemplate, state: null });
  }
  const version = options.agentVersion;
  return {
    header: {
      formatVersion: recordingFormatVersion,
      source: "export",
      agent: options.agent,
      agentVersion: version && versionPattern.test(version) ? version : "unknown",
      platform: process.platform,
      context: contextOf(options, startMilliseconds),
    },
    timeline,
    expected,
  };
}
