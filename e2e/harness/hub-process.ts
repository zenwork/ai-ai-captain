import { spawn, type ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const startTimeoutMilliseconds = 30_000;
const stopTimeoutMilliseconds = 10_000;
const pollIntervalMilliseconds = 100;
const outputTailCharacters = 4_000;

/** The folders that the hub under test uses. They all are inside one temporary folder. */
export interface HubDirectories {
  home: string;
  data: string;
  codex: string;
  copilot: string;
  claude: string;
  junie: string;
  jetbrainsInstances: string;
  /** The file that receives the focus commands. The hub does not run them. */
  focusLog: string;
}

export interface HubOptions {
  /** The folder for all files of the hub and the simulators. */
  temporaryDirectory: string;
  /** The port of the hub. A free port is the default. */
  port?: number;
  discoveryIntervalMilliseconds?: number;
}

export interface HubHandle {
  url: string;
  port: number;
  directories: HubDirectories;
  /** The last output of the hub. It helps to find the reason when the hub does not start. */
  outputTail(): string;
  stop(): Promise<void>;
}

export function hubDirectories(temporaryDirectory: string): HubDirectories {
  return {
    home: join(temporaryDirectory, "home"),
    data: join(temporaryDirectory, "data"),
    codex: join(temporaryDirectory, "codex"),
    copilot: join(temporaryDirectory, "copilot"),
    claude: join(temporaryDirectory, "claude"),
    junie: join(temporaryDirectory, "junie"),
    jetbrainsInstances: join(temporaryDirectory, "jetbrains-instances"),
    focusLog: join(temporaryDirectory, "focus.log"),
  };
}

/** Asks the operating system for a free port. */
export function findFreePort(): Promise<number> {
  return new Promise((resolvePromise, rejectPromise) => {
    const server = createServer();
    server.once("error", rejectPromise);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address === null || typeof address === "string") {
          rejectPromise(new Error("The operating system gave no port"));
          return;
        }
        resolvePromise(address.port);
      });
    });
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function waitUntilHealthy(url: string, hub: ChildProcess, outputTail: () => string): Promise<void> {
  const deadline = Date.now() + startTimeoutMilliseconds;
  while (Date.now() < deadline) {
    if (hub.exitCode !== null) throw new Error(`The hub stopped during start. Last output:\n${outputTail()}`);
    const healthy = await fetch(`${url}/health`).then(
      (response) => response.ok,
      () => false,
    );
    if (healthy) return;
    await delay(pollIntervalMilliseconds);
  }
  throw new Error(`The hub did not answer in time. Last output:\n${outputTail()}`);
}

/** Starts the real hub as a child process. The hub only sees the folders of the temporary folder. */
export async function startHub(options: HubOptions): Promise<HubHandle> {
  const directories = hubDirectories(options.temporaryDirectory);
  // The focus log is a file. The hub makes it when the first focus command arrives.
  const folders = [
    directories.home,
    directories.data,
    directories.codex,
    directories.copilot,
    directories.claude,
    directories.junie,
    directories.jetbrainsInstances,
  ];
  await Promise.all(folders.map((folder) => mkdir(folder, { recursive: true })));
  const port = options.port ?? (await findFreePort());
  const url = `http://127.0.0.1:${String(port)}`;
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    // The home folder is temporary too. Thus the hub cannot read the real files of the user.
    HOME: directories.home,
    USERPROFILE: directories.home,
    AI_AI_CAPTAIN_DATA_DIR: directories.data,
    AI_AI_CAPTAIN_CODEX_HOME: directories.codex,
    AI_AI_CAPTAIN_COPILOT_HOME: directories.copilot,
    AI_AI_CAPTAIN_CLAUDE_HOME: directories.claude,
    AI_AI_CAPTAIN_JUNIE_HOME: directories.junie,
    AI_AI_CAPTAIN_JETBRAINS_INSTANCES: directories.jetbrainsInstances,
    AI_AI_CAPTAIN_PORT: String(port),
    AI_AI_CAPTAIN_WEB_DIR: join(repositoryRoot, "web"),
    AI_AI_CAPTAIN_LOG_LEVEL: "warn",
    AI_AI_CAPTAIN_SANDBOX: "1",
    AI_AI_CAPTAIN_FOCUS_LOG: directories.focusLog,
    AI_AI_CAPTAIN_DISCOVERY_INTERVAL_MILLISECONDS: String(options.discoveryIntervalMilliseconds ?? 500),
  };
  const hub = spawn(process.execPath, ["--import", "tsx", join(repositoryRoot, "src", "server", "main.ts")], {
    cwd: repositoryRoot,
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const collect = (chunk: Buffer): void => {
    output = (output + chunk.toString("utf8")).slice(-outputTailCharacters);
  };
  hub.stdout.on("data", collect);
  hub.stderr.on("data", collect);
  const outputTail = (): string => output;
  try {
    await waitUntilHealthy(url, hub, outputTail);
  } catch (error) {
    hub.kill("SIGKILL");
    throw error;
  }

  const stop = async (): Promise<void> => {
    if (hub.exitCode !== null || hub.signalCode !== null) return;
    const closed = new Promise<void>((resolvePromise) => {
      hub.once("exit", () => {
        resolvePromise();
      });
    });
    hub.kill("SIGTERM");
    const timer = setTimeout(() => hub.kill("SIGKILL"), stopTimeoutMilliseconds);
    await closed;
    clearTimeout(timer);
  };
  return { url, port, directories, outputTail, stop };
}
