import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, symlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";

const startTimeoutMilliseconds = 10_000;
const stopTimeoutMilliseconds = 10_000;

// The agent process only has to exist and have the right name. The hub reads the files that the harness writes.
const agentScript = "setInterval(() => undefined, 1_000_000);";

// The host process is a fake terminal. It starts the agent as its child, so that the real terminal or editor
// that runs the test does not become the host of the agent in the parent chain.
const hostScript = `
const { spawn } = require("node:child_process");
const [agentExecutable, script] = process.argv.slice(1);
const agent = spawn(agentExecutable, ["-e", script], { stdio: "ignore" });
agent.on("exit", () => process.send({ type: "agent-exited" }));
process.send({ type: "agent-started", pid: agent.pid });
process.on("message", (message) => { if (message === "stop-agent") agent.kill(); });
process.on("disconnect", () => { agent.kill(); process.exit(0); });
`;

const hostMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("agent-started"), pid: z.number().int().positive() }),
  z.object({ type: z.literal("agent-exited") }),
]);

export interface AgentProcess {
  /** The process identifier of the agent. */
  pid: number;
  /** The time in milliseconds since 1970 when the agent started. */
  startedAt: number;
  /** Stops the agent and waits until it is gone. The fake host stays. */
  stopAgent(): Promise<void>;
  /** Stops the agent and the fake host. */
  stopAll(): Promise<void>;
}

export interface AgentProcessOptions {
  /** A folder where the harness makes the links to the Node.js program. */
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

async function makeLink(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await symlink(process.execPath, path).catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") return;
    throw error;
  });
}

function waitForMessage(host: ChildProcess, wanted: "agent-started" | "agent-exited", timeoutMilliseconds: number): Promise<number | undefined> {
  return new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => {
      host.off("message", onMessage);
      rejectPromise(new Error(`The fake host did not report "${wanted}" in time`));
    }, timeoutMilliseconds);
    const onMessage = (raw: unknown): void => {
      const message = hostMessageSchema.safeParse(raw);
      if (!message.success || message.data.type !== wanted) return;
      clearTimeout(timer);
      host.off("message", onMessage);
      resolvePromise(message.data.type === "agent-started" ? message.data.pid : undefined);
    };
    host.on("message", onMessage);
  });
}

/** Starts a fake host process and an agent process below it. */
export async function startAgentProcess(options: AgentProcessOptions): Promise<AgentProcess> {
  if (!isAgentSimulationSupported) throw new Error("The harness cannot make fake agent processes on this operating system");
  const agentPath = join(options.binDirectory, options.processName);
  const hostPath = hostExecutablePath(options.binDirectory);
  await makeLink(agentPath);
  await makeLink(hostPath);
  const host = spawn(hostPath, ["-e", hostScript, agentPath, agentScript], { stdio: ["ignore", "ignore", "ignore", "ipc"] });
  const pid = await waitForMessage(host, "agent-started", startTimeoutMilliseconds);
  if (pid === undefined) throw new Error("The fake host did not give the process identifier of the agent");
  const startedAt = Date.now();
  let agentStopped = false;

  const stopAgent = async (): Promise<void> => {
    if (agentStopped) return;
    agentStopped = true;
    const exited = waitForMessage(host, "agent-exited", stopTimeoutMilliseconds);
    host.send("stop-agent");
    await exited;
  };
  const stopAll = async (): Promise<void> => {
    if (host.exitCode !== null || host.signalCode !== null) return;
    const closed = new Promise<void>((resolvePromise) => {
      host.once("exit", () => {
        resolvePromise();
      });
    });
    host.disconnect();
    await closed;
  };
  return { pid, startedAt, stopAgent, stopAll };
}
