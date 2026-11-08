import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { type ClaudeCodeAgent } from "./claude-code.js";
import { type CodexAgent } from "./codex.js";
import { type CopilotAgent } from "./copilot.js";
import { type JunieAgent } from "./junie.js";
import type { DeckOptions, DeckSnapshot } from "./deck-fixture.js";
import { parseDurationMilliseconds } from "./duration.js";
import type { Session } from "../../src/shared/session.js";
import { recordingSchema, type Operation, type Recording } from "./recording.js";
import { startScenarioEnvironment, type ScenarioEnvironment } from "./scenario-environment.js";
import { itemsToRecording, recordingToItems, type ExpectationOptions, type ScenarioItem } from "./scenario-items.js";
import { playScenario } from "./scenario-player.js";

type AgentDefinition = ClaudeCodeAgent | CodexAgent | CopilotAgent | JunieAgent;
type AgentFactory = (agentKey: string) => AgentDefinition;

/** The fields of a session that an expectation can name. The editor shows the field names and the state names. */
export type SessionExpectation = { [Field in keyof Session]?: Session[Field] extends Record<string, unknown> ? Partial<Session[Field]> : Session[Field] };

/** The agents of a scenario. The key of each entry is the name that the steps use, for example `cli`. */
export type AgentFactories = Record<string, AgentFactory>;

type DefinitionsOf<Factories extends AgentFactories> = { [Key in keyof Factories]: ReturnType<Factories[Key]> };

export interface RunOptions {
  /** An environment that the caller started. The caller must stop it. Without it, the run starts its own hub. */
  environment?: ScenarioEnvironment;
  pace?: "none" | "realtime" | "fast";
  /** The time that the `fast` pace waits after each expectation. The default is one second. */
  settleMilliseconds?: number;
  report?: (line: string) => void;
  reportComment?: (line: string) => void;
}

const millisecondsPerSecond = 1_000;
// Set AI_AI_CAPTAIN_E2E_VERBOSE=1 to print one line for each step of a scenario in a test.
const verboseSteps = process.env.AI_AI_CAPTAIN_E2E_VERBOSE === "1";

/** The result of `.step()` for an agent step, or one operation. */
type StepResult = Operation | Operation[];

/**
 * The steps of a scenario. The type parameter holds the agents, so the editor knows the steps of each agent key:
 * `scenario("name", { cli: codex() }).step("cli", (agent) => agent.spawn())`.
 */
export class ScenarioBuilder<Factories extends AgentFactories = AgentFactories> {
  private items: ScenarioItem[] = [];
  private deckOptions: DeckOptions | undefined;
  private readonly agents = new Map<string, AgentDefinition>();
  private readonly definitions: DefinitionsOf<Factories>;

  constructor(
    private readonly name: string,
    factories?: Factories,
  ) {
    const created: Record<string, AgentDefinition> = {};
    for (const [agentKey, factory] of Object.entries(factories ?? {})) {
      const definition = factory(agentKey);
      created[agentKey] = definition;
      this.agents.set(agentKey, definition);
      this.recordingHeader = { source: "inline", agent: definition.kind, agentVersion: definition.version };
    }
    // TypeScript cannot show that `created` has exactly the keys of `Factories`. The loop above makes one definition for each key.
    this.definitions = created as DefinitionsOf<Factories>;
  }

  /** Adds the steps of a recording at the start. */
  static fromRecordingData(name: string, recording: Recording): ScenarioBuilder {
    const builder = new ScenarioBuilder(name);
    builder.items = recordingToItems(recording);
    builder.playsRecording = true;
    builder.contextLine = describeRecordingContext(recording);
    builder.recordingHeader = { source: recording.header.source, agent: recording.header.agent, agentVersion: recording.header.agentVersion };
    return builder;
  }

  private playsRecording = false;
  private contextLine: string | undefined;
  private recordingHeader = { source: "inline", agent: "unknown", agentVersion: "unknown" };

  /** Opens the virtual deck in a headless browser. Only a scenario with a deck can use deck steps. */
  deck(options: DeckOptions = {}): this {
    this.deckOptions = options;
    return this;
  }

  /** Runs the steps of an agent in sequence. The next line starts when they are complete. */
  step<Key extends keyof Factories & string>(agentKey: Key, build: (steps: DefinitionsOf<Factories>[Key]["steps"]) => StepResult): this {
    const result = build(this.definitions[agentKey].steps);
    for (const operation of Array.isArray(result) ? result : [result]) this.items.push({ kind: "operation", operation });
    return this;
  }

  /** Polls until the session of the agent has these fields. Give `undefined` to wait until the session is gone. */
  expectSession(agentKey: keyof Factories & string, expected: SessionExpectation | undefined, options: ExpectationOptions = {}): this {
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
    // A test should show when it plays a recording. The sandbox prints its own lines.
    const logRecording = this.playsRecording && options.report === undefined;
    const startedAt = Date.now();
    const elapsedSeconds = (): string => ((Date.now() - startedAt) / millisecondsPerSecond).toFixed(1);
    if (logRecording) console.info(`[recording] Playing ${this.name}: ${String(this.items.length)} steps`);
    // The context tells people what the recording shows. The sandbox shows it too.
    if (this.playsRecording && this.contextLine) console.info(this.contextLine);
    const report = options.report ?? (verboseSteps ? console.info : undefined);
    try {
      await playScenario({
        name: this.name,
        items: this.items,
        environment,
        ...(this.deckOptions ? { deck: this.deckOptions } : {}),
        pace: options.pace ?? "none",
        ...(options.settleMilliseconds === undefined ? {} : { settleMilliseconds: options.settleMilliseconds }),
        ...(report ? { report } : {}),
        // A recording tells its story in the test output, even when the step lines are off.
        ...(this.playsRecording ? { reportComment: console.info } : {}),
        recordingHeader: this.recordingHeader,
      });
      if (logRecording) console.info(`[recording] Finished ${this.name} in ${elapsedSeconds()} s`);
    } catch (error) {
      failed = true;
      if (logRecording) console.info(`[recording] Failed ${this.name} after ${elapsedSeconds()} s`);
      throw error;
    } finally {
      // The files of a failed run stay, so that a person can read the recording of the steps.
      if (!options.environment) await environment.stop({ keepFiles: failed });
    }
  }

  private requireAgent(agentKey: string): AgentDefinition {
    const definition = this.agents.get(agentKey);
    if (!definition) throw new Error(`The scenario has no agent "${agentKey}". Declare it in the second argument of scenario()`);
    return definition;
  }
}

function createScenario<Factories extends AgentFactories>(name: string, agents?: Factories): ScenarioBuilder<Factories> {
  return new ScenarioBuilder(name, agents);
}

/** Reads a recording file and makes a scenario from it. The read is synchronous, so that `.until()` and `.step()` can follow. */
/** Makes one line that tells what a recording shows: the agent, the day, the model, and the settings. */
function describeRecordingContext(recording: Recording): string {
  const { header } = recording;
  const parts = [`${header.agent} ${header.agentVersion}`];
  const context = header.context;
  if (context) {
    parts.push(`recorded ${context.recordedOn}`);
    if (context.model) parts.push(`model ${context.model}`);
    for (const [name, value] of Object.entries(context.settings ?? {})) parts.push(`${name}=${value}`);
  }
  return `[recording] Context: ${parts.join(", ")}`;
}

function fromRecording(file: string): ScenarioBuilder {
  const recording = recordingSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  return ScenarioBuilder.fromRecordingData(relative(process.cwd(), file), recording);
}

export const scenario = Object.assign(createScenario, { fromRecording });
