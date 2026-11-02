import { mkdir, readFile, readdir, realpath, rename, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { focusTargetSchema, type FocusTarget } from "../shared/session.js";
import { hostApplication, listOpenFiles, type ProcessInfo } from "./processes.js";

// The saved file can come from an earlier version. Each entry is validated separately, so one bad entry does not discard the others.
const persistedLifetimesSchema = z.object({
  ideProcesses: z.array(z.unknown()).optional(),
  runtimes: z.array(z.unknown()).optional(),
});
const persistedIdeProcessSchema = z.tuple([z.number(), z.string()]);
const persistedRuntimeHostSchema = z.object({ pid: z.number(), identity: z.string(), target: focusTargetSchema });

// The instance file that IntelliJ IDEA writes for each open project.
const ideaInstanceSchema = z.object({ schema_version: z.literal(2), pid: z.number(), project_path: z.string() });

/** Parses JSON text. Returns `undefined` for text that is not JSON, so that schema validation rejects it. */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export interface HostLifetime {
  status: "open" | "closed" | "unverified";
  evidence: string;
  openedAt?: number;
}

export type LifetimeInspector = (owner: { pid: number; focusTarget?: FocusTarget }, project?: string) => Promise<HostLifetime>;

interface OpenProject {
  path: string;
  openedAt: number;
}

export function revokedTerminals(output: string): Set<number> {
  let pid = 0;
  const revoked = new Set<number>();
  for (const line of output.split("\n")) {
    if (line.startsWith("p")) pid = Number(line.slice(1));
    if (pid && line === "n(revoked)") revoked.add(pid);
  }
  return revoked;
}

export function connectedTerminals(output: string): Set<number> {
  let pid = 0;
  const connected = new Set<number>();
  for (const line of output.split("\n")) {
    if (line.startsWith("p")) pid = Number(line.slice(1));
    if (pid && /^n\/dev\/(?:ttys?\w*|pts\/\d+)$/.test(line)) connected.add(pid);
  }
  return connected;
}

export class HostLifetimes {
  readonly #knownIdePids = new Map<number, string>();
  readonly #runtimeHosts = new Map<number, { identity: string; target: FocusTarget }>();
  #loaded = false;
  #persisted = "";

  constructor(
    private readonly instancesDirectory: string,
    private readonly persistencePath?: string,
  ) {}

  async scan(processes: ProcessInfo[]): Promise<LifetimeInspector> {
    const byPid = new Map(processes.map((process) => [process.pid, process]));
    if (!this.#loaded) {
      this.#loaded = true;
      await this.#restore();
    }
    const identity = (process: ProcessInfo) => JSON.stringify([process.name, process.startedAt]);
    for (const [pid, previous] of this.#knownIdePids) {
      const current = byPid.get(pid);
      if (!current || previous !== identity(current)) this.#knownIdePids.delete(pid);
    }
    for (const [pid, previous] of this.#runtimeHosts) {
      const current = byPid.get(pid);
      if (!current || previous.identity !== identity(current)) this.#runtimeHosts.delete(pid);
    }
    const candidates = processes.filter((process) => /(?:^|\/)(?:copilot|copilot-runtime|codex|claude)$/.test(process.name));
    for (const candidate of candidates) {
      const target = hostApplication(candidate.pid, processes);
      if (target) this.#runtimeHosts.set(candidate.pid, { identity: identity(candidate), target });
    }
    const projects = new Map<number, OpenProject[]>();
    const unavailablePids = new Set<number>();
    let registryAvailable = true;
    try {
      const entries = await readdir(this.instancesDirectory);
      await Promise.all(
        entries.map(async (entry) => {
          const match = /_(\d+)\.json$/.exec(entry);
          const pid = match ? Number(match[1]) : 0;
          const host = byPid.get(pid);
          if (!host || !/\/IntelliJ IDEA[^/]*\.app\/Contents\/MacOS\/idea$/.test(host.name)) return;
          const path = join(this.instancesDirectory, entry);
          try {
            const [content, info] = await Promise.all([readFile(path, "utf8"), stat(path)]);
            const instance = ideaInstanceSchema.safeParse(JSON.parse(content));
            if (!instance.success || instance.data.pid !== pid || !isAbsolute(instance.data.project_path)) {
              unavailablePids.add(pid);
              return;
            }
            const instanceProjectPath = instance.data.project_path;
            const projectPath = await realpath(instanceProjectPath).catch(() => resolve(instanceProjectPath));
            if (host.startedAt && info.birthtimeMs < Date.parse(host.startedAt)) return;
            const open = projects.get(pid) ?? [];
            open.push({ path: projectPath, openedAt: info.birthtimeMs || info.mtimeMs });
            projects.set(pid, open);
            this.#knownIdePids.set(pid, identity(host));
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") unavailablePids.add(pid);
          }
        }),
      );
    } catch {
      registryAvailable = false;
    }
    const persisted = JSON.stringify({ ideProcesses: [...this.#knownIdePids], runtimes: [...this.#runtimeHosts].map(([pid, host]) => ({ pid, ...host })) });
    if (this.persistencePath && persisted !== this.#persisted) {
      try {
        await mkdir(dirname(this.persistencePath), { recursive: true });
        await writeFile(`${this.persistencePath}.tmp`, persisted, { mode: 0o600 });
        await rename(`${this.persistencePath}.tmp`, this.persistencePath);
        this.#persisted = persisted;
      } catch {}
    }
    const terminalPids = new Set<number>();
    for (const candidate of candidates) {
      if (/intellij/i.test(hostApplication(candidate.pid, processes)?.appName ?? "")) continue;
      const visited = new Set<number>();
      let current: ProcessInfo | undefined = candidate;
      while (current && current.pid !== 1 && !visited.has(current.pid)) {
        visited.add(current.pid);
        terminalPids.add(current.pid);
        current = byPid.get(current.parentPid);
      }
    }
    const endpoints = await listOpenFiles([...terminalPids], "0,1,2").catch(() => "");
    const revoked = revokedTerminals(endpoints);
    const connected = connectedTerminals(endpoints);
    const knownIdePids = new Set(this.#knownIdePids.keys());
    const runtimeHosts = new Map(this.#runtimeHosts);
    return async (owner, project) => {
      const target = owner.focusTarget ?? runtimeHosts.get(owner.pid)?.target;
      if (target?.pid && !byPid.has(target.pid)) return { status: "closed", evidence: "Host application exited" };
      if (/intellij/i.test(target?.appName ?? "")) {
        const pid = target?.pid;
        if (!pid || !project || !isAbsolute(project) || !registryAvailable || unavailablePids.has(pid) || !knownIdePids.has(pid)) {
          return { status: "unverified", evidence: "Project registration unavailable" };
        }
        const projectPath = await realpath(project).catch(() => resolve(project));
        const open = (projects.get(pid) ?? [])
          .filter((candidate) => {
            const local = relative(candidate.path, projectPath);
            return local === "" || (local !== ".." && !local.startsWith(`..${sep}`) && !isAbsolute(local));
          })
          .sort((left, right) => right.path.length - left.path.length)[0];
        return open
          ? { status: "open", evidence: "JetBrains project registration", openedAt: open.openedAt }
          : { status: "closed", evidence: "JetBrains project unregistered" };
      }
      const visited = new Set<number>();
      let current = byPid.get(owner.pid);
      let terminalConnected = false;
      while (current && current.pid !== 1 && !visited.has(current.pid)) {
        if (revoked.has(current.pid)) return { status: "closed", evidence: "Terminal connection revoked" };
        if (connected.has(current.pid)) terminalConnected = true;
        visited.add(current.pid);
        current = byPid.get(current.parentPid);
      }
      if (terminalConnected) return { status: "open", evidence: "Live terminal connection" };
      return { status: "unverified", evidence: "Runtime ownership only" };
    };
  }

  /** Reads the IDE processes and runtime hosts that an earlier hub saved. A missing or damaged file gives no entries. */
  async #restore(): Promise<void> {
    if (!this.persistencePath) return;
    let content: string;
    try {
      content = await readFile(this.persistencePath, "utf8");
    } catch {
      return;
    }
    const saved = persistedLifetimesSchema.safeParse(parseJson(content));
    if (!saved.success) return;
    for (const entry of saved.data.ideProcesses ?? []) {
      const ideProcess = persistedIdeProcessSchema.safeParse(entry);
      if (ideProcess.success) this.#knownIdePids.set(ideProcess.data[0], ideProcess.data[1]);
    }
    for (const entry of saved.data.runtimes ?? []) {
      const runtimeHost = persistedRuntimeHostSchema.safeParse(entry);
      if (runtimeHost.success) this.#runtimeHosts.set(runtimeHost.data.pid, { identity: runtimeHost.data.identity, target: runtimeHost.data.target });
    }
  }
}

export class SessionLifetimeGate {
  readonly #suppressed = new Map<string, string | undefined>();

  visible(id: string, lifetime: HostLifetime, triggeredAt?: string): boolean {
    if (lifetime.status === "closed") {
      this.#suppressed.set(id, triggeredAt);
      return false;
    }
    if (this.#suppressed.has(id)) {
      const baseline = this.#suppressed.get(id);
      if (lifetime.status !== "open" || !triggeredAt || (baseline && triggeredAt <= baseline)) return false;
    }
    if (lifetime.openedAt && triggeredAt && Date.parse(triggeredAt) < lifetime.openedAt) {
      this.#suppressed.set(id, triggeredAt);
      return false;
    }
    this.#suppressed.delete(id);
    return true;
  }

  forget(id: string): void {
    this.#suppressed.delete(id);
  }
}
