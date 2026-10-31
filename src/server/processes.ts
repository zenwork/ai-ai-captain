import { execFile } from "node:child_process";
import { readdir, readlink } from "node:fs/promises";
import { basename } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import type { FocusTarget } from "../shared/session.js";

const execute = promisify(execFile);
const windowsProcessScript = "Get-CimInstance Win32_Process | ForEach-Object { [pscustomobject]@{ pid = [int]$_.ProcessId; parentPid = [int]$_.ParentProcessId; name = if ($_.ExecutablePath) { $_.ExecutablePath } else { $_.Name }; startedAt = if ($_.CreationDate) { $_.CreationDate.ToUniversalTime().ToString('o') } else { $null } } } | ConvertTo-Json -Compress";
const windowsProcessSchema = z.object({
  pid: z.number(),
  parentPid: z.number(),
  name: z.string(),
  startedAt: z.string().nullable().optional(),
});
const windowsProcessListSchema = z.union([z.array(windowsProcessSchema), windowsProcessSchema.transform((entry) => [entry])]);
// Names of terminal and editor programs. Only used on Linux and Windows, where there are no app bundles.
const knownHostPrograms = new Map([
  ["gnome-terminal-server", "GNOME Terminal"],
  ["konsole", "Konsole"],
  ["xfce4-terminal", "Xfce Terminal"],
  ["alacritty", "Alacritty"],
  ["kitty", "kitty"],
  ["wezterm-gui", "WezTerm"],
  ["xterm", "xterm"],
  ["windowsterminal", "Windows Terminal"],
  ["code", "Visual Studio Code"],
  ["idea", "IntelliJ IDEA"],
  ["idea64", "IntelliJ IDEA"],
]);

export interface ProcessInfo {
  pid: number;
  parentPid: number;
  name: string;
  startedAt?: string;
}

export async function listProcesses(platform: NodeJS.Platform = process.platform): Promise<ProcessInfo[]> {
  if (platform === "win32") return listWindowsProcesses();
  // macOS has /bin/ps. Other systems find ps on the PATH.
  const command = platform === "darwin" ? "/bin/ps" : "ps";
  const { stdout } = await execute(command, ["-axo", "pid=,ppid=,lstart=,comm="], { timeout: 4000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, LC_ALL: "C" } });
  return parseProcesses(stdout);
}

async function listWindowsProcesses(): Promise<ProcessInfo[]> {
  const { stdout } = await execute("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", windowsProcessScript], { timeout: 10_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
  return parseWindowsProcesses(stdout);
}

export function parseWindowsProcesses(output: string): ProcessInfo[] {
  if (output.trim() === "") return [];
  const parsed = windowsProcessListSchema.safeParse(JSON.parse(output));
  if (!parsed.success) return [];
  return parsed.data.map((entry) => ({
    pid: entry.pid,
    parentPid: entry.parentPid,
    // Use forward slashes and no .exe suffix, so that the name patterns work on all systems.
    name: entry.name.replaceAll("\\", "/").replace(/\.exe$/i, ""),
    ...(entry.startedAt ? { startedAt: entry.startedAt } : {}),
  }));
}

export function parseProcesses(output: string): ProcessInfo[] {
  return output.split("\n").flatMap((line) => {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\w{3}\s+\w{3}\s+\d+\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(.+)$/);
    if (!match || !Number.isFinite(Date.parse(match[3]))) return [];
    return [{ pid: Number(match[1]), parentPid: Number(match[2]), name: match[4], startedAt: new Date(match[3]).toISOString() }];
  });
}

/** Reads the open files of one process from /proc. The output has the same format as `lsof -Fpn`. */
async function listLinuxOpenFiles(pids: number[], descriptors?: string): Promise<string> {
  const wanted = descriptors === undefined ? undefined : new Set(descriptors.split(","));
  const lines: string[] = [];
  for (const pid of pids) {
    const directory = `/proc/${String(pid)}/fd`;
    const names = await readdir(directory).catch(() => [] as string[]);
    const targets: string[] = [];
    for (const name of names) {
      if (wanted && !wanted.has(name)) continue;
      const target = await readlink(`${directory}/${name}`).catch(() => undefined);
      if (target !== undefined) targets.push(target);
    }
    if (targets.length === 0) continue;
    lines.push(`p${String(pid)}`, ...targets.map((target) => `n${target}`));
  }
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}

/** Windows has no command that lists the open files of a process. The result is empty, so owners come from lock files only. */
export async function listOpenFiles(pids: number[], descriptors?: string, platform: NodeJS.Platform = process.platform): Promise<string> {
  if (!pids.length) return "";
  if (platform === "win32") return "";
  if (platform === "linux") return listLinuxOpenFiles(pids, descriptors);
  try {
    const { stdout } = await execute("/usr/sbin/lsof", ["-n", "-a", "-p", pids.join(","), ...(descriptors ? ["-d", descriptors] : []), "-Fpn"], { timeout: 4000, maxBuffer: 8 * 1024 * 1024 });
    return stdout;
  } catch (error) {
    const failure = error as { code?: number; stdout?: string };
    if (failure.code === 1) return failure.stdout ?? "";
    throw error;
  }
}

/** Finds the nearest known terminal or editor program above a process. Used where there are no app bundles. */
function hostProgram(pid: number, processes: ProcessInfo[]): FocusTarget | undefined {
  const byPid = new Map(processes.map((entry) => [entry.pid, entry]));
  const visited = new Set<number>();
  let current = byPid.get(pid);
  while (current && !visited.has(current.pid)) {
    visited.add(current.pid);
    const programName = basename(current.name.replaceAll("\\", "/")).toLowerCase().replace(/\.exe$/, "");
    const displayName = knownHostPrograms.get(programName);
    if (displayName) return { pid: current.pid, appName: displayName };
    current = byPid.get(current.parentPid);
  }
  return undefined;
}

export function hostApplication(pid: number, processes: ProcessInfo[], platform: NodeJS.Platform = process.platform): FocusTarget | undefined {
  if (platform !== "darwin") return hostProgram(pid, processes);
  const byPid = new Map(processes.map((process) => [process.pid, process]));
  const visited = new Set<number>();
  let current = byPid.get(pid);
  while (current && !visited.has(current.pid)) {
    visited.add(current.pid);
    // Use the outermost app bundle. Helper apps nested inside an app cannot be activated.
    const match = current.name.match(/^(.*?\/([^/]+)\.app)\/Contents\/.*[^/]$/);
    if (match) {
      const appName = match[2].startsWith("IntelliJ IDEA") ? "IntelliJ IDEA" : match[2];
      return { pid: current.pid, appName, appPath: match[1] };
    }
    current = byPid.get(current.parentPid);
  }
  return undefined;
}
