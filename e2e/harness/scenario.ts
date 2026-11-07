import { readFileSync } from "node:fs";
import { type AgentSteps } from "./agent-steps.js";
import { type ClaudeCodeAgent } from "./claude-code.js";
import { type CodexAgent } from "./codex.js";
import type { DeckOptions, DeckSnapshot } from "./deck-fixture.js";
import { parseDurationMilliseconds } from "./duration.js";
import { recordingSchema, type Operation, type Recording } from "./recording.js";
import { startScenarioEnvironment, type ScenarioEnvironment } from "./scenario-environment.js";
import { itemsToRecording, recordingToItems, type ExpectationOptions, type ScenarioItem } from "./scenario-items.js";
import { playScenario } from "./scenario-player.js";

type AgentDefinition = ClaudeCodeAgent | CodexAgent;
type AgentFactory = (agentKey: string) => AgentDefinition;

export interface RunOptions {
  /** An environment that the caller started. The caller must stop it. Without it, the run starts its own hub. */
  environment?: ScenarioEnvironment;
  pace?: "none" | "realtime";
  report?: (line: string) => void;
}

/** The result of `.step()` for an agent step, or one operation. */
type StepResult = Operation | Operation[];

export class ScenarioBuilder {
  private items: ScenarioItem[] = [];
  private deckOptions: DeckOptions | undefined;
  private readonly agents = new Map<string, AgentDefinition>();

  constructor(private readonly name: string) {}

  /** Adds the steps of a recording at the start. */
  static fromRecordingData(name: string, recording: Recording): ScenarioBuilder {
    const builder = new ScenarioBuilder(name);
    builder.items = recordingToItems(recording);
    builder.recordingHeader = { source: recording.header.source, agent: recording.header.agent, agentVersion: recording.header.agentVersion };
    return builder;
  }

  private recordingHeader = { source: "inline", agent: "unknown", agentVersion: "unknown" };

  /** Opens the virtual deck in a headless browser. Only a scenario with a deck can use deck steps. */
  deck(options: DeckOptions = {}): this {
    this.deckOptions = options;
    return this;
  }

  /** Declares an agent. The key names it in later steps. */
  agent(agentKey: string, factory: AgentFactory): this {
    const definition = factory(agentKey);
    this.agents.set(agentKey, definition);
    this.recordingHeader = { source: "inline", agent: definition.kind, agentVersion: definition.version };
    return this;
  }

  /** Runs the steps of an agent in sequence. The next line starts when they are complete. */
  step(agentKey: string, build: (steps: AgentSteps) => StepResult): this {
    const definition = this.requireAgent(agentKey);
    const result = build(definition.steps);
    for (const operation of Array.isArray(result) ? result : [result]) this.items.push({ kind: "operation", operation });
    return this;
  }

  /** Polls until the session of the agent has these fields. Give `undefined` to wait until the session is gone. */
  expectSession(agentKey: string, expected: Record<string, unknown> | undefined, options: ExpectationOptions = {}): this {
    const definition = this.requireAgent(agentKey);
    const template =
      this.agents.size > 1 ? definition.sessionIdentifierTemplate.replace("{SESSION}", `{SESSION:${agentKey}}`) : definition.sessionIdentifierTemplate;
    this.items.push({ kind: "expectSession", sessionTemplate: template, expected, options });
    return this;
  }

  /** Polls until the check passes for a snapshot of the deck. */
  expectDeck(check: (snapshot: DeckSnapshot) => void | Promise<void>, options: ExpectationOptions = {}): this {
    this.items.push({ kind: "expectDeck", check, options });
    return this;
  }

  /** Moves the clock of the deck page forward, to age a DONE session. The deck needs `clock: "manual"`. */
  advanceDeckClock(duration: string): this {
    this.items.push({ kind: "advanceDeckClock", milliseconds: parseDurationMilliseconds(duration) });
    return this;
  }

  /** Presses the session key or the app key with this number on the virtual deck. */
  pressKey(number: number): this {
    this.items.push({ kind: "pressKey", number });
    return this;
  }

  /** Polls until the hub has run a focus command for this application. The hub writes the command and does not run it. */
  expectFocus(expected: { appName: string }, options: ExpectationOptions = {}): this {
    this.items.push({ kind: "expectFocus", appName: expected.appName, options });
    return this;
  }

  /** Waits. Use it only for behavior that depends on time. Use an expectation in all other cases. */
  wait(duration: string): this {
    this.items.push({ kind: "wait", milliseconds: parseDurationMilliseconds(duration) });
    return this;
  }

  /** Keeps the steps up to a time. Use it to replay a part of a recording and then continue with inline steps. */
  until(duration: string): this {
    const limit = parseDurationMilliseconds(duration);
    this.items = this.items.filter((item) => !("offsetMilliseconds" in item) || item.offsetMilliseconds === undefined || item.offsetMilliseconds <= limit);
    return this;
  }

  /** Makes a recording from the steps that a recording can hold. Deck steps and waits are not part of it. */
  toRecording(): Recording {
    return itemsToRecording(this.items, this.recordingHeader, this.agents.size <= 1);
  }

  /** Runs the scenario against the real hub. It throws a `ScenarioFailure` when a step fails. */
  async run(options: RunOptions = {}): Promise<void> {
    const environment = options.environment ?? (await startScenarioEnvironment());
    let failed = false;
    try {
      await playScenario({
        name: this.name,
        items: this.items,
        environment,
        ...(this.deckOptions ? { deck: this.deckOptions } : {}),
        pace: options.pace ?? "none",
        ...(options.report ? { report: options.report } : {}),
        recordingHeader: this.recordingHeader,
      });
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      // The files of a failed run stay, so that a person can read the recording of the steps.
      if (!options.environment) await environment.stop({ keepFiles: failed });
    }
  }

  private requireAgent(agentKey: string): AgentDefinition {
    const definition = this.agents.get(agentKey);
    if (!definition) throw new Error(`The scenario has no agent "${agentKey}". Declare it with .agent() first`);
    return definition;
  }
}

function createScenario(name: string): ScenarioBuilder {
  return new ScenarioBuilder(name);
}

/** Reads a recording file and makes a scenario from it. The read is synchronous, so that `.until()` and `.step()` can follow. */
function fromRecording(file: string): ScenarioBuilder {
  const recording = recordingSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  return ScenarioBuilder.fromRecordingData(file, recording);
}

export const scenario = Object.assign(createScenario, { fromRecording });
