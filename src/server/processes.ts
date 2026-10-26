import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { FocusTarget } from "../shared/session.js";

const execute = promisify(execFile);

export interface ProcessInfo {
  pid: number;
  parentPid: number;
  name: string;
  startedAt?: string;
}

export async function listProcesses(): Promise<ProcessInfo[]> {
  const { stdout } = await execute("/bin/ps", ["-axo", "pid=,ppid=,lstart=,comm="], { timeout: 4000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, LC_ALL: "C" } });
  return parseProcesses(stdout);
}

export function parseProcesses(output: string): ProcessInfo[] {
  return output.split("\n").flatMap((line) => {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\w{3}\s+\w{3}\s+\d+\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(.+)$/);
    if (!match || !Number.isFinite(Date.parse(match[3]))) return [];
    return [{ pid: Number(match[1]), parentPid: Number(match[2]), name: match[4], startedAt: new Date(match[3]).toISOString() }];
  });
}

export async function listOpenFiles(pids: number[], descriptors?: string): Promise<string> {
  if (!pids.length) return "";
  try {
    const { stdout } = await execute("/usr/sbin/lsof", ["-n", "-a", "-p", pids.join(","), ...(descriptors ? ["-d", descriptors] : []), "-Fpn"], { timeout: 4000, maxBuffer: 8 * 1024 * 1024 });
    return stdout;
  } catch (error) {
    const failure = error as { code?: number; stdout?: string };
    if (failure.code === 1) return failure.stdout ?? "";
    throw error;
  }
}

export function hostApplication(pid: number, processes: ProcessInfo[]): FocusTarget | undefined {
  const byPid = new Map(processes.map((process) => [process.pid, process]));
  const visited = new Set<number>();
  let current = byPid.get(pid);
  while (current && !visited.has(current.pid)) {
    visited.add(current.pid);
    const match = current.name.match(/^(.*\/([^/]+)\.app)\/Contents\/MacOS\/[^/]+$/);
    if (match) {
      const appName = match[2].startsWith("IntelliJ IDEA") ? "IntelliJ IDEA" : match[2];
      return { pid: current.pid, appName, appPath: match[1] };
    }
    current = byPid.get(current.parentPid);
  }
  return undefined;
}
