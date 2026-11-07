import { z } from "zod";
import { formatDurationMilliseconds } from "../../e2e/harness/duration.js";
import type { Operation, Recording } from "../../e2e/harness/recording.js";
import { recordingFormatVersion } from "../../e2e/harness/recording.js";

const agentKey = "cli";
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

export interface AssembleOptions {
  agent: string;
  /** The version text from the file. The export uses it only when it has a safe form. */
  agentVersion: string | undefined;
  /** The operations that start the process and open the files. They come from the steps of the simulator. */
  preamble: Operation[];
  /** The path of the file that receives the events. It has placeholders. */
  appendPath: string;
  sessionTemplate: string;
  events: ExportedEvent[];
  /** Applies one event to the state reducer of the hub and gives the new state. */
  stateAfter: (line: JsonObject, timestampMilliseconds: number) => string;
}

/** Makes a recording from the kept events. The expected states come from the state reducer of the hub. */
export function assembleRecording(options: AssembleOptions): Recording {
  const timeline: Recording["timeline"] = options.preamble.map((operation) => ({ ...operation }));
  const expected: Recording["expected"] = [];
  const startMilliseconds = options.events[0]?.timestampMilliseconds ?? 0;
  let offsetMilliseconds = 0;
  let previousState: string | undefined;
  for (const event of options.events) {
    offsetMilliseconds = Math.max(offsetMilliseconds, event.timestampMilliseconds - startMilliseconds);
    const offset = formatDurationMilliseconds(offsetMilliseconds);
    timeline.push({ offset, operation: "append", agent: agentKey, path: options.appendPath, content: event.line });
    const state = options.stateAfter(event.line, event.timestampMilliseconds);
    if (state === previousState) continue;
    expected.push({ offset, session: options.sessionTemplate, state });
    previousState = state;
  }
  const exitOffset = formatDurationMilliseconds(offsetMilliseconds + exitDelayMilliseconds);
  timeline.push({ offset: exitOffset, operation: "exit", agent: agentKey });
  expected.push({ offset: exitOffset, session: options.sessionTemplate, state: null });
  const version = options.agentVersion;
  return {
    header: {
      formatVersion: recordingFormatVersion,
      source: "export",
      agent: options.agent,
      agentVersion: version && versionPattern.test(version) ? version : "unknown",
      platform: process.platform,
    },
    timeline,
    expected,
  };
}
