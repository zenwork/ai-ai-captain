import { spawn } from "node:child_process";
import { mkdir, symlink } from "node:fs/promises";
import { dirname, join } from "node:path";

const startTimeoutMilliseconds = 10_000;
const stopTimeoutMilliseconds = 10_000;
const pollIntervalMilliseconds = 50;
const forceStopDelayMilliseconds = 2_000;

// A program that only waits. A scenario stops it earlier. The limit makes sure that a lost process ends by itself.
const agentLifetimeSeconds = "600";

// The fake agent and the fake host are links to programs that are not Node.js. The operating system takes the
// process name from the name of the link. Node.js on Linux renames its main thread to "MainThread", so a link to
// the Node.js program does not give the name that the hub looks for.
const agentProgram = "/bin/sleep";
const hostProgram = "/bin/sh";

// The host starts the agent as its child, so that the real terminal or editor that runs the test does not become
// the host of the agent. It writes the process identifier of the agent. Then it waits for the agent to stop and
// stays alive, as a terminal does, until the harness closes its input.
const hostScript = `"$0" ${agentLifetimeSeconds} & echo "$!"; wait; read -r _`;

export interface AgentProcess {
  /** The process identifier of the agent. */
  pid: number;
  /** The process identifier of the fake host program. */
  hostPid: number;
  /** The time in milliseconds since 1970 when the agent started. */
  startedAt: number;
  /** Stops the agent and waits until it is gone. The fake host stays. */
  stopAgent(): Promise<void>;
  /** Stops the agent and the fake host. */
  stopAll(): Promise<void>;
}

export interface AgentProcessOptions {
  /** A folder where the harness makes the links to the programs. */
  binDirectory: string;
  /** The name that the hub looks for, for example `claude`. */
  processName: string;
}

/** The harness can make fake host programs on macOS and Linux only. */
export const isAgentSimulationSupported = process.platform === "darwin" || process.platform === "linux";

/** Gives the path of the fake host program. The hub finds the host application from this path. */
function hostExecutablePath(binDirectory: string): string {
  if (process.platform === "darwin") return join(binDirectory, "Terminal.app", "Contents", "MacOS", "Terminal");
  // The hub knows the program name `xterm` as a terminal on Linux.
  return join(binDirectory, "xterm");
}

async function makeLink(target: string, path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await symlink(target, path).catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") return;
    throw error;
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitUntilGone(pid: number, timeoutMilliseconds: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return true;
    await delay(pollIntervalMilliseconds);
  }
  return !isAlive(pid);
}

/** Starts a fake host process and an agent process below it. */
export async function startAgentProcess(options: AgentProcessOptions): Promise<AgentProcess> {
  if (!isAgentSimulationSupported) throw new Error("The harness cannot make fake agent processes on this operating system");
  const agentPath = join(options.binDirectory, options.processName);
  const hostPath = hostExecutablePath(options.binDirectory);
  await makeLink(agentProgram, agentPath);
  await makeLink(hostProgram, hostPath);
  const host = spawn(hostPath, ["-c", hostScript, agentPath], { stdio: ["pipe", "pipe", "ignore"] });
  const hostPid = host.pid;
  if (hostPid === undefined) throw new Error("The fake host did not start");

  const pid = await new Promise<number>((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => {
      rejectPromise(new Error("The fake host did not report the process identifier of the agent in time"));
    }, startTimeoutMilliseconds);
    let received = "";
    host.stdout.on("data", (chunk: Buffer) => {
      received += chunk.toString("utf8");
      const line = received.split("\n")[0];
      if (!received.includes("\n") || !/^\d+$/.test(line)) return;
      clearTimeout(timer);
      resolvePromise(Number(line));
    });
    host.once("exit", () => {
      clearTimeout(timer);
      rejectPromise(new Error("The fake host stopped before it reported the agent"));
    });
  }).catch((error: unknown) => {
    host.kill("SIGKILL");
    throw error;
  });
  const startedAt = Date.now();

  const stopAgent = async (): Promise<void> => {
    if (!isAlive(pid)) return;
    process.kill(pid, "SIGTERM");
    if (!(await waitUntilGone(pid, stopTimeoutMilliseconds))) throw new Error("The fake agent did not stop in time");
  };
  const stopAll = async (): Promise<void> => {
    await stopAgent().catch(() => undefined);
    if (host.exitCode !== null || host.signalCode !== null) return;
    const closed = new Promise<void>((resolvePromise) => {
      host.once("exit", () => {
        resolvePromise();
      });
    });
    // The host ends when its input closes. The signal covers a host that does not end.
    host.stdin.end();
    const timer = setTimeout(() => host.kill("SIGKILL"), forceStopDelayMilliseconds);
    await closed;
    clearTimeout(timer);
  };
  return { pid, hostPid, startedAt, stopAgent, stopAll };
}
