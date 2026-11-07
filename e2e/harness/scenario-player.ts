import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { sessionSchema, type Session } from "../../src/shared/session.js";
import { startAgentProcess, type AgentProcess } from "./agent-process.js";
import { DeckFixture, type DeckOptions, type DeckSnapshot } from "./deck-fixture.js";
import { parseDurationMilliseconds } from "./duration.js";
import { findDifference } from "./partial-match.js";
import { resolveInsideDirectory, resolvePlaceholders } from "./placeholders.js";
import type { Operation } from "./recording.js";
import type { ScenarioEnvironment } from "./scenario-environment.js";
import { itemsToRecording, type ExpectationOptions, type ScenarioItem } from "./scenario-items.js";

const execute = promisify(execFile);
const hubOutputCharacters = 1_500;
const defaultExpectationMilliseconds = 15_000;
const pollIntervalMilliseconds = 100;

const sessionListSchema = z.object({ sessions: z.array(sessionSchema) });
const focusLogLineSchema = z.object({ command: z.string(), args: z.array(z.string()) });

export interface PlayOptions {
  name: string;
  items: ScenarioItem[];
  environment: ScenarioEnvironment;
  deck?: DeckOptions;
  /** With `realtime`, a step with an offset waits until its time. The default is `none`: the steps run as fast as the expectations allow. */
  pace?: "none" | "realtime";
  /** Receives one line for each step. The sandbox shows these lines. */
  report?: (line: string) => void;
  /** Gives the first agent kind and version for the recording that is written when a step fails. */
  recordingHeader: { source: string; agent: string; agentVersion: string };
}

interface AgentRuntime {
  sessionUuid: string;
  process?: AgentProcess;
}

/** The error of a failed step. The message has the scenario name, the step number, and the last data of the hub. */
export class ScenarioFailure extends Error {}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function describeItem(item: ScenarioItem): string {
  switch (item.kind) {
    case "operation":
      return `${item.operation.operation}${"agent" in item.operation && item.operation.agent ? ` (${item.operation.agent})` : ""}`;
    case "expectSession":
      return `expect session ${item.sessionTemplate}${item.expected === undefined ? " to be absent" : ` to match ${JSON.stringify(item.expected)}`}`;
    case "expectDeck":
      return "expect deck";
    case "advanceDeckClock":
      return `advance deck clock by ${String(item.milliseconds)} ms`;
    case "pressKey":
      return `press key ${String(item.number)}`;
    case "expectFocus":
      return `expect focus on ${item.appName}`;
    case "wait":
      return `wait ${String(item.milliseconds)} ms`;
  }
}

class ScenarioPlayer {
  private readonly agents = new Map<string, AgentRuntime>();
  private currentAgentKey: string | undefined;
  private deck: DeckFixture | undefined;
  private lastSessions: Session[] = [];
  private lastDeck: DeckSnapshot | undefined;
  private readonly startedAt = Date.now();
  private executedCount = 0;

  constructor(private readonly options: PlayOptions) {}

  async play(): Promise<void> {
    try {
      if (this.options.deck) this.deck = await DeckFixture.open(this.options.environment.hub.url, this.options.deck);
      for (const [index, item] of this.options.items.entries()) {
        await this.playItem(item, index + 1);
        this.executedCount = index + 1;
      }
    } finally {
      await this.cleanUp();
    }
  }

  private async playItem(item: ScenarioItem, stepNumber: number): Promise<void> {
    if (this.options.pace === "realtime" && "offsetMilliseconds" in item && item.offsetMilliseconds !== undefined) {
      await delay(Math.max(0, this.startedAt + item.offsetMilliseconds - Date.now()));
    }
    const description = describeItem(item);
    try {
      await this.execute(item);
    } catch (error) {
      this.options.report?.(`FAIL  step ${String(stepNumber)}  ${description}`);
      throw await this.failure(stepNumber, description, error);
    }
    this.options.report?.(`PASS  step ${String(stepNumber)}  ${description}`);
  }

  private async execute(item: ScenarioItem): Promise<void> {
    switch (item.kind) {
      case "operation":
        return this.runOperation(item.operation);
      case "expectSession":
        return this.expectSession(item.sessionTemplate, item.expected, item.options);
      case "expectDeck":
        return this.expectDeck(item.check, item.options);
      case "advanceDeckClock":
        return this.requireDeck().advanceClock(item.milliseconds);
      case "pressKey":
        return this.requireDeck().press(item.number);
      case "expectFocus":
        return this.expectFocus(item.appName, item.options);
      case "wait":
        return delay(item.milliseconds);
    }
  }

  private requireDeck(): DeckFixture {
    if (!this.deck) throw new Error("This step needs a deck. Call .deck() before the step");
    return this.deck;
  }

  private agent(key: string): AgentRuntime {
    const existing = this.agents.get(key);
    if (existing) return existing;
    const created: AgentRuntime = { sessionUuid: randomUUID() };
    this.agents.set(key, created);
    return created;
  }

  private resolveAgentKey(agentKey: string | undefined): string {
    const key = agentKey ?? this.currentAgentKey ?? this.agents.keys().next().value;
    if (key === undefined) throw new Error("A placeholder needs an agent, but the scenario has none");
    return key;
  }

  private lookupPlaceholder = (name: string, agentKey: string | undefined): string | number => {
    const { directories } = this.options.environment.hub;
    const fixed: Record<string, string> = {
      HOME: directories.home,
      CLAUDE_HOME: directories.claude,
      CODEX_HOME: directories.codex,
      COPILOT_HOME: directories.copilot,
      JUNIE_HOME: directories.junie,
      PROJECT_1: this.options.environment.projectDirectory,
    };
    if (name in fixed) return fixed[name];
    const runtime = this.agent(this.resolveAgentKey(agentKey));
    if (name === "SESSION") return runtime.sessionUuid;
    if (!runtime.process) throw new Error(`The placeholder {${name}} needs a started agent`);
    if (name === "PID") return runtime.process.pid;
    if (name === "T") return runtime.process.startedAt;
    throw new Error(`The placeholder {${name}} is not known`);
  };

  private async runOperation(operation: Operation): Promise<void> {
    if (operation.operation === "spawn") {
      const runtime = this.agent(operation.agent);
      runtime.process = await startAgentProcess({ binDirectory: this.options.environment.binDirectory, processName: operation.processName });
      this.currentAgentKey = operation.agent;
      return;
    }
    if (operation.operation === "exit") {
      await this.agent(operation.agent).process?.stopAgent();
      return;
    }
    const agentKey = this.resolveAgentKey(operation.agent);
    const lookup = (name: string, key: string | undefined): string | number => this.lookupPlaceholder(name, key ?? agentKey);
    const path = resolveInsideDirectory(this.options.environment.temporaryDirectory, String(resolvePlaceholders(operation.path, lookup)));
    const content = resolvePlaceholders(operation.content, lookup);
    await mkdir(dirname(path), { recursive: true });
    if (typeof content === "string") {
      await writeFile(path, content);
      return;
    }
    // A complete file appears in one step, so the hub never reads half of a registration.
    const temporaryPath = `${path}.writing`;
    await writeFile(temporaryPath, JSON.stringify(content));
    await rename(temporaryPath, path);
  }

  private async readSessions(): Promise<Session[]> {
    const response = await fetch(`${this.options.environment.hub.url}/api/sessions`);
    const parsed = sessionListSchema.parse(await response.json());
    this.lastSessions = parsed.sessions;
    return parsed.sessions;
  }

  private async expectSession(template: string, expected: Record<string, unknown> | undefined, options: ExpectationOptions): Promise<void> {
    const identifier = String(resolvePlaceholders(template, this.lookupPlaceholder));
    await this.pollUntil(options, async () => {
      const session = (await this.readSessions()).find((candidate) => candidate.id === identifier);
      if (expected === undefined) return session === undefined ? undefined : `session ${identifier} exists, but it must not exist`;
      if (!session) return `session ${identifier} does not exist`;
      return findDifference(session, expected);
    });
  }

  private async expectDeck(check: (snapshot: DeckSnapshot) => void | Promise<void>, options: ExpectationOptions): Promise<void> {
    const deck = this.requireDeck();
    await this.pollUntil(options, async () => {
      const snapshot = await deck.snapshot();
      this.lastDeck = snapshot;
      try {
        await check(snapshot);
        return undefined;
      } catch (error) {
        return errorText(error);
      }
    });
  }

  private async expectFocus(appName: string, options: ExpectationOptions): Promise<void> {
    const logPath = this.options.environment.hub.directories.focusLog;
    await this.pollUntil(options, async () => {
      const text = await readFile(logPath, "utf8").catch(() => "");
      const lines = text.split("\n").filter((line) => line.length > 0);
      const commands = lines.map((line) => focusLogLineSchema.parse(JSON.parse(line)));
      const found = commands.some((command) => command.args.join(" ").includes(appName));
      return found ? undefined : `the focus log has no command for ${appName}`;
    });
  }

  /**
   * Calls the check until it gives no difference. A check that agrees at once is enough, unless `during` is set.
   * With `during`, the check must agree for the whole time.
   */
  private async pollUntil(options: ExpectationOptions, check: () => Promise<string | undefined>): Promise<void> {
    const limit = options.within ? parseDurationMilliseconds(options.within) : defaultExpectationMilliseconds;
    const deadline = Date.now() + limit;
    let difference = await check();
    while (difference !== undefined) {
      if (Date.now() >= deadline) throw new Error(difference);
      await delay(pollIntervalMilliseconds);
      difference = await check();
    }
    if (!options.during) return;
    const holdUntil = Date.now() + parseDurationMilliseconds(options.during);
    while (Date.now() < holdUntil) {
      await delay(pollIntervalMilliseconds);
      const changed = await check();
      if (changed !== undefined) throw new Error(`the value changed during the wait: ${changed}`);
    }
  }

  private async failure(stepNumber: number, description: string, error: unknown): Promise<ScenarioFailure> {
    const recordingPath = join(this.options.environment.temporaryDirectory, `${this.options.name.replaceAll(/\W+/g, "-")}.recording.json`);
    const recording = itemsToRecording(this.options.items.slice(0, this.executedCount), this.options.recordingHeader, this.agents.size <= 1);
    await writeFile(recordingPath, JSON.stringify(recording, undefined, 2)).catch(() => undefined);
    const sessions = this.lastSessions.map((session) => ({ id: session.id, state: session.state, harness: session.harness, model: session.model }));
    const deckKeys = this.lastDeck?.view.keys.filter((key) => key.kind === "session" || key.kind === "app").map((key) => key.label);
    const lines = [
      `Scenario "${this.options.name}" failed at step ${String(stepNumber)}: ${description}`,
      errorText(error),
      `Last sessions of the hub: ${JSON.stringify(sessions)}`,
      ...(await this.describeEvidence()),
      ...(deckKeys ? [`Last deck keys: ${JSON.stringify(deckKeys)}`] : []),
      `Steps until the failure: ${recordingPath}`,
    ];
    return new ScenarioFailure(lines.join("\n"));
  }

  /** Shows what the hub could see: the fake processes, the registration files, and the last output of the hub. */
  private async describeEvidence(): Promise<string[]> {
    const processIdentifiers = [...this.agents.values()].flatMap((runtime) => (runtime.process ? [runtime.process.hostPid, runtime.process.pid] : []));
    const processList = await execute("ps", ["-axo", "pid=,ppid=,comm="]).then(
      (result) => result.stdout,
      () => "",
    );
    const processLines = processList
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => processIdentifiers.includes(Number(line.split(/\s+/)[0])));
    const { directories } = this.options.environment.hub;
    const registrationFiles = await readdir(join(directories.claude, "sessions")).catch(() => []);
    return [
      `Fake processes (pid, parent, name): ${JSON.stringify(processLines)}`,
      `Registration files: ${JSON.stringify(registrationFiles)}`,
      `Last output of the hub: ${JSON.stringify(this.options.environment.hub.outputTail().slice(-hubOutputCharacters))}`,
    ];
  }

  private async cleanUp(): Promise<void> {
    await this.deck?.close();
    for (const runtime of this.agents.values()) await runtime.process?.stopAll();
  }
}

/** Plays the steps of a scenario against the hub of the environment. */
export async function playScenario(options: PlayOptions): Promise<void> {
  await new ScenarioPlayer(options).play();
}
