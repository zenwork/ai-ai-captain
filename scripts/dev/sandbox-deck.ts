// Sets up the physical Stream Deck for a test with mock agents. macOS only.
// Usage: npm run sandbox:deck -- [scenario module or recording ...]
// The script quits the Stream Deck app, starts the sandbox hub on the normal port, and starts the app again.
// The plugin then uses the sandbox hub. The sandbox plays the scenarios again and again until you press Control and C.
import { execFile, spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const defaultScenarioModule = "e2e/scenarios/claude-code-lifecycle.ts";
const hubPort = 43681;
const appName = "Elgato Stream Deck";
const appProcessPattern = "Elgato Stream Deck.app/Contents/MacOS/Stream Deck";
const quitTimeoutMilliseconds = 30_000;
const portFreeTimeoutMilliseconds = 20_000;
const pollIntervalMilliseconds = 500;
const sandboxReadyText = "Sandbox hub:";

/** Gives the arguments for the sandbox. The sandbox loops, and the life cycle scenario is the default. */
export function sandboxDeckArguments(scenarioFiles: string[]): string[] {
  return ["--loop", ...(scenarioFiles.length > 0 ? scenarioFiles : [defaultScenarioModule])];
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function waitUntil(condition: () => Promise<boolean>, timeoutMilliseconds: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    if (await condition()) return true;
    await delay(pollIntervalMilliseconds);
  }
  return condition();
}

async function isStreamDeckRunning(): Promise<boolean> {
  // The command ends with code 1 when no process agrees with the pattern.
  return execute("/usr/bin/pgrep", ["-f", appProcessPattern]).then(
    () => true,
    () => false,
  );
}

async function isHubAnswering(): Promise<boolean> {
  return fetch(`http://127.0.0.1:${String(hubPort)}/health`).then(
    (response) => response.ok,
    () => false,
  );
}

/** Quits the app and waits until the hub of the plugin is gone. The script never stops a hub by force. */
async function quitStreamDeck(): Promise<boolean> {
  console.info("Quit the Stream Deck app. The hub of the plugin stops with it.");
  await execute("/usr/bin/osascript", ["-e", `tell application "${appName}" to quit`]).catch(() => undefined);
  if (!(await waitUntil(async () => !(await isStreamDeckRunning()), quitTimeoutMilliseconds))) {
    console.error("The Stream Deck app did not quit. Quit it yourself and run the command again.");
    return false;
  }
  if (!(await waitUntil(async () => !(await isHubAnswering()), portFreeTimeoutMilliseconds))) {
    console.error(`Another hub still listens on port ${String(hubPort)}. Stop it and run the command again.`);
    return false;
  }
  return true;
}

function startStreamDeck(): void {
  console.info("Start the Stream Deck app. It connects to the sandbox hub.");
  void execute("/usr/bin/open", ["-a", appName]).catch(() => {
    console.error(`The script could not start the app "${appName}". Start it yourself.`);
  });
}

function runSandbox(sandboxArguments: string[]): Promise<number> {
  return new Promise((resolvePromise) => {
    const sandbox = spawn(process.execPath, ["--import", "tsx", "scripts/dev/sandbox.ts", ...sandboxArguments], {
      cwd: repositoryRoot,
      stdio: ["ignore", "pipe", "inherit"],
    });
    let appStarted = false;
    sandbox.stdout.on("data", (chunk: Buffer) => {
      process.stdout.write(chunk);
      if (appStarted || !chunk.toString("utf8").includes(sandboxReadyText)) return;
      appStarted = true;
      startStreamDeck();
    });
    // The terminal sends Control and C to the sandbox too. This line covers a signal that only this script gets.
    process.once("SIGINT", () => sandbox.kill("SIGINT"));
    process.once("SIGTERM", () => sandbox.kill("SIGTERM"));
    sandbox.once("exit", (code) => {
      resolvePromise(code ?? 1);
    });
  });
}

async function main(): Promise<void> {
  if (process.platform !== "darwin") {
    console.error("This command works on macOS only. On other systems, start the sandbox with `npm run sandbox` and start the Stream Deck app yourself.");
    process.exitCode = 1;
    return;
  }
  if (await isStreamDeckRunning()) {
    if (!(await quitStreamDeck())) {
      process.exitCode = 1;
      return;
    }
  } else if (await isHubAnswering()) {
    console.error(`A hub listens on port ${String(hubPort)}, but the Stream Deck app does not run. Stop that hub and run the command again.`);
    process.exitCode = 1;
    return;
  }
  const code = await runSandbox(sandboxDeckArguments(process.argv.slice(2)));
  console.info("The sandbox stopped. The plugin starts its own hub again in a few seconds.");
  process.exitCode = code;
}

// Tests import this file. They must not start the setup.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
