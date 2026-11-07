import { formatDurationMilliseconds, parseDurationMilliseconds } from "./duration.js";
import { recordingFormatVersion, type ExpectedState, type Operation, type Recording, type TimelineStep } from "./recording.js";
import type { DeckSnapshot } from "./deck-fixture.js";

export interface ExpectationOptions {
  /** A longer time limit, for example "30s". The default is 15 seconds. */
  within?: string;
  /** Make sure that the value stays the same for this time after it agrees, for example "5s". */
  during?: string;
}

/** One step of a scenario. A recording and an inline scenario both make a list of these items. */
export type ScenarioItem =
  | { kind: "operation"; offsetMilliseconds?: number; operation: Operation }
  | {
      kind: "expectSession";
      offsetMilliseconds?: number;
      /** The identifier of the session. It can contain placeholders. */
      sessionTemplate: string;
      /** The fields that the session must have. The value `undefined` means that the session must not exist. */
      expected: Record<string, unknown> | undefined;
      options: ExpectationOptions;
    }
  | { kind: "expectDeck"; check: (snapshot: DeckSnapshot) => void | Promise<void>; options: ExpectationOptions }
  | { kind: "advanceDeckClock"; milliseconds: number }
  | { kind: "pressKey"; number: number }
  | { kind: "expectFocus"; appName: string; options: ExpectationOptions }
  | { kind: "wait"; milliseconds: number };

export interface RecordingHeaderInput {
  source: string;
  agent: string;
  agentVersion: string;
}

function toTimelineStep(item: ScenarioItem & { kind: "operation" }): TimelineStep {
  const offset = item.offsetMilliseconds === undefined ? {} : { offset: formatDurationMilliseconds(item.offsetMilliseconds) };
  return { ...offset, ...item.operation };
}

function toExpectedState(item: ScenarioItem & { kind: "expectSession" }): ExpectedState | undefined {
  const offset = item.offsetMilliseconds === undefined ? {} : { offset: formatDurationMilliseconds(item.offsetMilliseconds) };
  if (item.expected === undefined) return { ...offset, session: item.sessionTemplate, state: null };
  // A recording keeps the session state only. Other fields and the deck checks belong to inline scenarios.
  if (typeof item.expected.state !== "string") return undefined;
  return { ...offset, session: item.sessionTemplate, state: item.expected.state };
}

/** Makes a recording from the steps that a scenario can record. Deck checks and waits are not part of a recording. */
export function itemsToRecording(items: ScenarioItem[], header: RecordingHeaderInput, singleAgent: boolean): Recording {
  const timeline: TimelineStep[] = [];
  const expected: ExpectedState[] = [];
  for (const item of items) {
    if (item.kind === "operation") {
      const step = toTimelineStep(item);
      // With one agent, the agent of a write is clear. The recording is shorter without it.
      if (singleAgent && step.operation === "write") timeline.push({ ...step, agent: undefined });
      else timeline.push(step);
    }
    if (item.kind === "expectSession") {
      const state = toExpectedState(item);
      if (state) expected.push(state);
    }
  }
  return { header: { formatVersion: recordingFormatVersion, ...header, platform: "any" }, timeline, expected };
}

/** Makes the steps of a scenario from a recording. Steps with the same offset keep their order: timeline first. */
export function recordingToItems(recording: Recording): ScenarioItem[] {
  const entries: { offsetMilliseconds: number; rank: number; index: number; item: ScenarioItem }[] = [];
  for (const [index, step] of recording.timeline.entries()) {
    const { offset, ...operation } = step;
    const offsetMilliseconds = offset === undefined ? 0 : parseDurationMilliseconds(offset);
    entries.push({ offsetMilliseconds, rank: 0, index, item: { kind: "operation", offsetMilliseconds, operation } });
  }
  for (const [index, state] of recording.expected.entries()) {
    const offsetMilliseconds = state.offset === undefined ? 0 : parseDurationMilliseconds(state.offset);
    const expected = state.state === null ? undefined : { state: state.state };
    entries.push({
      offsetMilliseconds,
      rank: 1,
      index,
      item: { kind: "expectSession", offsetMilliseconds, sessionTemplate: state.session, expected, options: {} },
    });
  }
  entries.sort((first, second) => first.offsetMilliseconds - second.offsetMilliseconds || first.rank - second.rank || first.index - second.index);
  return entries.map((entry) => entry.item);
}
