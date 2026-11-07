// Plays scenarios in real time against a hub on the normal port, for the virtual deck and the physical deck.
// Usage: npm run sandbox -- [--port=<number>] [--loop] [--fast] [--settle=<duration>] <scenario module or recording> [more...]
// With --fast, the sandbox ignores the times in recordings and the pauses in scenarios. It waits only 1 second (or --settle) after each check.
// With --loop, the sandbox plays the scenarios again and again until you press Control and C.
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { parseDurationMilliseconds } from "../../e2e/harness/duration.js";
import { scenario, ScenarioBuilder } from "../../e2e/harness/scenario.js";
import { startScenarioEnvironment } from "../../e2e/harness/scenario-environment.js";

const defaultSandboxPort = 43681;
const portArgumentPrefix = "--port=";
const loopArgument = "--loop";
const fastArgument = "--fast";
const settleArgumentPrefix = "--settle=";
const pauseBetweenRoundsMilliseconds = 3_000;
const sandboxScanIntervalMilliseconds = 1_000;

function isScenarioBuilder(value: unknown): value is ScenarioBuilder {
  return value instanceof ScenarioBuilder;
}

/** Reads the scenarios from a recording file or from a module that exports a list named `scenarios`. */
async function loadScenarios(file: string): Promise<ScenarioBuilder[]> {
  const path = resolve(file);
  if (path.endsWith(".json")) return [scenario.fromRecording(path)];
  const loaded: unknown = await import(pathToFileURL(path).href);
  const exported = typeof loaded === "object" && loaded !== null && "scenarios" in loaded ? loaded.scenarios : undefined;
  if (!Array.isArray(exported) || !exported.every(isScenarioBuilder)) {
    throw new Error(`The module ${file} must export a list named "scenarios" with scenarios.`);
  }
  return exported;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function isHubRunning(port: number): Promise<boolean> {
  return fetch(`http://127.0.0.1:${String(port)}/health`).then(
    (response) => response.ok,
    () => false,
  );
}

async function main(): Promise<void> {
  const argumentsList = process.argv.slice(2);
  const portArgument = argumentsList.find((argument) => argument.startsWith(portArgumentPrefix));
  const sandboxPort = portArgument ? Number(portArgument.slice(portArgumentPrefix.length)) : defaultSandboxPort;
  const loop = argumentsList.includes(loopArgument);
  const fast = argumentsList.includes(fastArgument);
  const settleArgument = argumentsList.find((argument) => argument.startsWith(settleArgumentPrefix));
  const settleMilliseconds = settleArgument ? parseDurationMilliseconds(settleArgument.slice(settleArgumentPrefix.length)) : undefined;
  const files = argumentsList.filter(
    (argument) =>
      !argument.startsWith(portArgumentPrefix) && !argument.startsWith(settleArgumentPrefix) && argument !== loopArgument && argument !== fastArgument,
  );
  if (files.length === 0) {
    console.error("Give at least one scenario module or recording. Example: npm run sandbox -- e2e/scenarios/claude-code-lifecycle.ts");
    process.exitCode = 1;
    return;
  }
  if (await isHubRunning(sandboxPort)) {
    console.error(`A hub already listens on port ${String(sandboxPort)}. Stop it first. The sandbox must not mix its sessions with real sessions.`);
    process.exitCode = 1;
    return;
  }
  const scenarios = (await Promise.all(files.map(loadScenarios))).flat();
  const environment = await startScenarioEnvironment({ port: sandboxPort, discoveryIntervalMilliseconds: sandboxScanIntervalMilliseconds });
  console.info(`Sandbox hub: ${environment.hub.url}  Virtual deck: ${environment.hub.url}/deck.html`);
  let stopRequested = false;
  const requestStop = (): void => {
    stopRequested = true;
    void environment.stop().finally(() => process.exit(0));
  };
  process.once("SIGINT", requestStop);
  process.once("SIGTERM", requestStop);
  try {
    do {
      for (const item of scenarios)
        await item.run({
          environment,
          pace: fast ? "fast" : "realtime",
          ...(settleMilliseconds === undefined ? {} : { settleMilliseconds }),
          report: console.info,
        });
      console.info(loop ? "All scenarios passed. Starting again. Press Control and C to stop." : "All scenarios passed.");
      if (loop) await delay(pauseBetweenRoundsMilliseconds);
    } while (loop && !stopRequested);
  } catch (error) {
    // A stop request closes the hub. The running step then fails, and this failure is not a problem.
    if (!stopRequested) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  } finally {
    await environment.stop({ keepFiles: process.exitCode === 1 });
  }
}

void main();
