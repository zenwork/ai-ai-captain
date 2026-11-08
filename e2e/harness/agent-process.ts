import { spawn } from "node:child_process";
import { mkdir, symlink } from "node:fs/promises";
import { dirname, join } from "node:path";

const startTimeoutMilliseconds = 10_000;
const stopTimeoutMilliseconds = 10_000;
const pollIntervalMilliseconds = 50;
const forceStopDelayMilliseconds = 2_000;

const errorOutputCharacters = 2_000;

// The fake agent and the fake host are links to the shell. The operating system takes the process name from the
// name of the link. Node.js on Linux renames its main thread to "MainThread", so a link to the Node.js program does
// not give the name that the hub looks for. A link to a multi-call program such as `sleep` is not safe either:
// it can stop at once when its name is not one of its own commands. A shell does not depend on its name.
const shellProgram = "/bin/sh";

// The fake agent reads one command for each line from its input. The commands are:
//   open <number> <path>   Keep the file open on this file descriptor. A real Codex process does this with its lock file.
//   close <number>         Close the file descriptor.
//   quit                   Stop the agent.
// It writes the line "ack" after each command. When the input closes, the agent stops, so no process stays
// after a test that ended without a clean stop.
const agentScript = [
  "while IFS=' ' read -r command number path; do",
  '  case "$command" in',
  '    open) eval "exec $number<>\\"\\$path\\"" ;;',
  '    close) eval "exec $number>&-" ;;',
  "    quit) exit 0 ;;",
  "  esac",
  "  echo ack",
  "done",
].join("\n");

// The host starts the agent as its child, so that the real terminal or editor that runs the test does not become
// the host of the agent. The agent reads the input of the host. The host writes the process identifier of the agent.
// Then it waits for the agent to stop and stays alive, as a terminal does, until the harness closes its input.
// A shell gives /dev/null as input to a background job, even when the job names "<&0". Thus the host copies its input
// to the file descriptor 3 first, and the agent closes that copy.
const hostScript = 'exec 3<&0; "$0" -c "$1" <&3 3<&- & echo "$!"; wait; read -r _';

// The shell can use the file descriptors 3 to 9 in the command "exec".
const firstFileDescriptor = 3;
const lastFileDescriptor = 9;
const acknowledgementTimeoutMilliseconds = 5_000;

export interface AgentProcess {
  /** The process identifier of the agent. */
  pid: number;
  /** The process identifier of the fake host program. */
  hostPid: number;
  /** The time in milliseconds since 1970 when the agent started. */
  startedAt: number;
  /** Keeps a file open in the agent process, as a real agent does with a lock file. The file is made when it is missing. */
  holdOpen(path: string): Promise<void>;
  /** Closes a file that `holdOpen` opened. */
  release(path: string): Promise<void>;
  /** Stops the agent and waits until it is gone. The fake host stays. */
  stopAgent(): Promise<void>;
  /** Stops the agent and the fake host. */
  stopAll(): Promise<void>;
  /** The last error output of the fake processes. It helps to find the reason when a fake process stops by itself. */
  errorOutput(): string;
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

/** Collects the lines that the fake host writes. The first line is the process identifier of the agent. */
class HostOutput {
  private received = "";
  private readonly waiting: (() => void)[] = [];
  private pendingAcknowledgements = 0;
  private firstLine: string | undefined;
  private onFirstLine: ((line: string) => void) | undefined;

  add(chunk: string): void {
    this.received += chunk;
    for (let newline = this.received.indexOf("\n"); newline !== -1; newline = this.received.indexOf("\n")) {
      const line = this.received.slice(0, newline);
      this.received = this.received.slice(newline + 1);
      this.takeLine(line);
    }
  }

  private takeLine(line: string): void {
    if (this.firstLine === undefined) {
      this.firstLine = line;
      this.onFirstLine?.(line);
      return;
    }
    if (line !== "ack") return;
    const next = this.waiting.shift();
    if (next) next();
    else this.pendingAcknowledgements += 1;
  }

  waitForFirstLine(): Promise<string> {
    if (this.firstLine !== undefined) return Promise.resolve(this.firstLine);
    return new Promise((resolvePromise) => {
      this.onFirstLine = resolvePromise;
    });
  }

  waitForAcknowledgement(timeoutMilliseconds: number): Promise<void> {
    if (this.pendingAcknowledgements > 0) {
      this.pendingAcknowledgements -= 1;
      return Promise.resolve();
    }
    return new Promise((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        rejectPromise(new Error("The fake agent did not answer a command in time"));
      }, timeoutMilliseconds);
      this.waiting.push(() => {
        clearTimeout(timer);
        resolvePromise();
      });
    });
  }
}

/** Starts a fake host process and an agent process below it. */
export async function startAgentProcess(options: AgentProcessOptions): Promise<AgentProcess> {
  if (!isAgentSimulationSupported) throw new Error("The harness cannot make fake agent processes on this operating system");
  const agentPath = join(options.binDirectory, options.processName);
  const hostPath = hostExecutablePath(options.binDirectory);
  await makeLink(shellProgram, agentPath);
  await makeLink(shellProgram, hostPath);
  const host = spawn(hostPath, ["-c", hostScript, agentPath, agentScript], { stdio: ["pipe", "pipe", "pipe"] });
  let errorText = "";
  host.stderr.on("data", (chunk: Buffer) => {
    errorText = (errorText + chunk.toString("utf8")).slice(-errorOutputCharacters);
  });
  const output = new HostOutput();
  host.stdout.on("data", (chunk: Buffer) => {
    output.add(chunk.toString("utf8"));
  });
  const hostPid = host.pid;
  if (hostPid === undefined) throw new Error("The fake host did not start");

  const pid = await new Promise<number>((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => {
      rejectPromise(new Error("The fake host did not report the process identifier of the agent in time"));
    }, startTimeoutMilliseconds);
    host.once("exit", () => {
      clearTimeout(timer);
      rejectPromise(new Error("The fake host stopped before it reported the agent"));
    });
    void output.waitForFirstLine().then((line) => {
      clearTimeout(timer);
      if (/^\d+$/.test(line)) resolvePromise(Number(line));
      else rejectPromise(new Error("The fake host gave a line that is not a process identifier"));
    });
  }).catch((error: unknown) => {
    host.kill("SIGKILL");
    throw error;
  });
  const startedAt = Date.now();

  const heldFiles = new Map<string, number>();
  const send = async (command: string): Promise<void> => {
    const acknowledged = output.waitForAcknowledgement(acknowledgementTimeoutMilliseconds);
    host.stdin.write(`${command}\n`);
    await acknowledged;
  };
  const holdOpen = async (path: string): Promise<void> => {
    if (heldFiles.has(path)) return;
    const used = new Set(heldFiles.values());
    let fileDescriptor = firstFileDescriptor;
    while (used.has(fileDescriptor) && fileDescriptor <= lastFileDescriptor) fileDescriptor += 1;
    if (fileDescriptor > lastFileDescriptor) throw new Error("The fake agent can hold at most seven files open");
    // A line break in a path would split the command. A path from a recording is data from outside.
    if (path.includes("\n")) throw new Error("A path for holdOpen must not contain a line break");
    heldFiles.set(path, fileDescriptor);
    await send(`open ${String(fileDescriptor)} ${path}`);
  };
  const release = async (path: string): Promise<void> => {
    const fileDescriptor = heldFiles.get(path);
    if (fileDescriptor === undefined) throw new Error("The fake agent does not hold this file open");
    heldFiles.delete(path);
    await send(`close ${String(fileDescriptor)}`);
  };

  const stopAgent = async (): Promise<void> => {
    if (!isAlive(pid)) return;
    host.stdin.write("quit\n");
    if (await waitUntilGone(pid, stopTimeoutMilliseconds)) return;
    process.kill(pid, "SIGKILL");
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
  return { pid, hostPid, startedAt, holdOpen, release, stopAgent, stopAll, errorOutput: () => errorText };
}
