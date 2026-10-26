import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connectedTerminals, HostLifetimes, revokedTerminals, SessionLifetimeGate } from "./lifetimes.js";
import { listOpenFiles } from "./processes.js";

vi.mock("./processes.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("./processes.js")>(),
  listOpenFiles: vi.fn(async () => ""),
}));

const directories: string[] = [];
const processes = [
  { pid: 10, parentPid: 1, name: "/Applications/IntelliJ IDEA.app/Contents/MacOS/idea" },
  { pid: 20, parentPid: 10, name: "/runtime/copilot-runtime" },
  { pid: 30, parentPid: 1, name: "/Applications/IntelliJ IDEA EAP.app/Contents/MacOS/idea" },
];
const owner = { pid: 20, focusTarget: { pid: 10, appName: "IntelliJ IDEA" } };

afterEach(async () => {
  vi.mocked(listOpenFiles).mockReset().mockResolvedValue("");
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "ai-ai-captain-lifetimes-"));
  directories.push(root);
  const instances = join(root, "instances");
  const project = join(root, "project");
  await mkdir(instances);
  await mkdir(project);
  const registration = join(instances, "project_10.json");
  await writeFile(registration, JSON.stringify({ schema_version: 2, pid: 10, project_path: project, rpc_token: "private-token" }));
  return { root, instances, project, registration, hosts: new HostLifetimes(instances) };
}

describe("host lifetimes", () => {
  it("removes orphaned Claude runtimes after their host exits", async () => {
    const { hosts, project } = await fixture();
    const inventory = [processes[0], { pid: 20, parentPid: 10, name: "/runtime/claude", startedAt: "2026-10-25T10:00:00Z" }];
    await hosts.scan(inventory);
    const orphan = [{ ...inventory[1], parentPid: 1 }];
    const inspect = await hosts.scan(orphan);
    expect(await inspect({ pid: 20 }, project)).toMatchObject({ status: "closed" });
  });
  it("uses live per-PID project registrations, not retained runtime files, recent projects, or project names", async () => {
    const { hosts, instances, project, registration, root } = await fixture();
    await writeFile(join(instances, "stale_999.json"), JSON.stringify({ schema_version: 2, pid: 999, project_path: join(root, "closed") }));
    let inspect = await hosts.scan(processes);
    expect(await inspect(owner, project)).toMatchObject({ status: "open", evidence: "JetBrains project registration", openedAt: expect.any(Number) });
    expect(await inspect(owner, join(root, "closed"))).toMatchObject({ status: "closed" });
    expect(await inspect({ pid: 31, focusTarget: { pid: 30, appName: "IntelliJ IDEA" } }, project)).toMatchObject({ status: "unverified" });
    expect(JSON.stringify(await inspect(owner, project))).not.toContain("private-token");
    await rm(registration);
    inspect = await hosts.scan(processes);
    expect(await inspect(owner, project)).toMatchObject({ status: "closed" });
  });

  it("matches nested working directories and symlinks without matching sibling prefixes", async () => {
    const { hosts, project, root } = await fixture();
    const link = join(root, "alias");
    await symlink(project, link);
    await mkdir(join(project, "src"));
    const inspect = await hosts.scan(processes);
    expect(await inspect(owner, link)).toMatchObject({ status: "open" });
    expect(await inspect(owner, join(project, "src"))).toMatchObject({ status: "open" });
    expect(await inspect(owner, `${project}-other`)).toMatchObject({ status: "closed" });
  });

  it("remembers registry support across hub restarts with all projects closed, without confusing reused PIDs", async () => {
    const { instances, project, registration, root } = await fixture();
    const statePath = join(root, "hub", "host-lifetimes.json");
    const inventory = processes.map((process) => ({ ...process, startedAt: "2026-10-25T10:00:00.000Z" }));
    await new HostLifetimes(instances, statePath).scan(inventory);
    await rm(registration);
    const inspect = await new HostLifetimes(instances, statePath).scan(inventory);
    expect(await inspect(owner, project)).toMatchObject({ status: "closed" });
    const reused = inventory.map((process) => ({ ...process, startedAt: "2026-10-25T14:00:00.000Z" }));
    const inspectReused = await new HostLifetimes(instances, statePath).scan(reused);
    expect(await inspectReused(owner, project)).toMatchObject({ status: "unverified" });
  });

  it("removes orphaned runtimes after their host quits, including after a hub restart", async () => {
    const { instances, project, root } = await fixture();
    const statePath = join(root, "hub", "host-lifetimes.json");
    const hosts = new HostLifetimes(instances, statePath);
    await hosts.scan(processes);
    const orphan = [{ pid: 20, parentPid: 1, name: "/runtime/copilot-runtime" }];
    expect(await (await hosts.scan(orphan))({ pid: 20 }, project)).toEqual({ status: "closed", evidence: "Host application exited" });
    const restarted = new HostLifetimes(instances, statePath);
    expect(await (await restarted.scan(orphan))({ pid: 20 }, project)).toMatchObject({ status: "closed" });
  });

  it("does not mistake missing, unreadable, malformed, or unsupported registration telemetry for project closure", async () => {
    const { hosts, instances, project, registration } = await fixture();
    await hosts.scan(processes);
    for (const content of ["not-json", "null", JSON.stringify({ schema_version: 3, pid: 10, project_path: project })]) {
      await writeFile(registration, content);
      const inspect = await hosts.scan(processes);
      expect(await inspect(owner, project)).toMatchObject({ status: "unverified" });
    }
    await rm(instances, { recursive: true });
    const inspect = await hosts.scan(processes);
    expect(await inspect(owner, project)).toMatchObject({ status: "unverified" });
  });

  it("detects revoked terminal descriptors through wrapper processes while keeping connected and headless clients", async () => {
    const { hosts } = await fixture();
    const clients = [
      ...processes,
      { pid: 40, parentPid: 1, name: "node" },
      { pid: 41, parentPid: 40, name: "/bin/copilot" },
      { pid: 50, parentPid: 1, name: "/bin/zsh" },
      { pid: 51, parentPid: 50, name: "/bin/codex" },
      { pid: 60, parentPid: 1, name: "/bin/copilot" },
    ];
    vi.mocked(listOpenFiles).mockResolvedValue("p40\nn(revoked)\np41\nnpipe\np50\nn/dev/ttys004\np51\nnpipe\np60\nn/dev/null\n");
    const inspect = await hosts.scan(clients);
    expect(await inspect({ pid: 41 })).toEqual({ status: "closed", evidence: "Terminal connection revoked" });
    expect(await inspect({ pid: 51 })).toEqual({ status: "open", evidence: "Live terminal connection" });
    expect(await inspect({ pid: 60 })).toMatchObject({ status: "unverified" });
    expect(listOpenFiles).toHaveBeenCalledWith(expect.arrayContaining([40, 41, 50, 51, 60]), "0,1,2");
    expect(vi.mocked(listOpenFiles).mock.calls[0][0]).not.toContain(20);
    vi.mocked(listOpenFiles).mockRejectedValue(new Error("lsof unavailable"));
    expect(await (await hosts.scan(clients))({ pid: 41 })).toMatchObject({ status: "unverified" });
  });

  it("parses terminal descriptors without treating a pipe or log file as a live terminal", () => {
    const output = "p40\nn(revoked)\np41\nnpipe\np50\nn/dev/ttys004\np51\nn/tmp/terminal.log\np60\nn/dev/pts/2\n";
    expect([...revokedTerminals(output)]).toEqual([40]);
    expect([...connectedTerminals(output)]).toEqual([50, 60]);
  });
});

describe("session lifetime gate", () => {
  it("does not resurrect a closed conversation when only the project reopens or detection temporarily fails", () => {
    const gate = new SessionLifetimeGate();
    const before = "2026-10-25T12:00:00.000Z";
    const after = "2026-10-25T13:00:00.000Z";
    expect(gate.visible("session", { status: "open", evidence: "test" }, before)).toBe(true);
    expect(gate.visible("session", { status: "closed", evidence: "test" }, before)).toBe(false);
    expect(gate.visible("session", { status: "unverified", evidence: "test" }, before)).toBe(false);
    expect(gate.visible("session", { status: "open", evidence: "test" }, before)).toBe(false);
    expect(gate.visible("session", { status: "open", evidence: "test" }, after)).toBe(true);
  });

  it("excludes history predating this project opening even after a hub restart", () => {
    const gate = new SessionLifetimeGate();
    const openedAt = Date.parse("2026-10-25T12:30:00.000Z");
    expect(gate.visible("old", { status: "open", evidence: "test", openedAt }, "2026-10-25T12:00:00.000Z")).toBe(false);
    expect(gate.visible("new", { status: "open", evidence: "test", openedAt }, "2026-10-25T13:00:00.000Z")).toBe(true);
    expect(gate.visible("missing-telemetry", { status: "open", evidence: "test", openedAt })).toBe(true);
  });
});
