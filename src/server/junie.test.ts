import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JunieTracker, junieEventState, lastJunieContext, lastJunieStatus, parseJunieSettings } from "./junie.js";
import type { LifetimeInspector } from "./lifetimes.js";
import type { ProcessInfo } from "./processes.js";
import { SessionStore } from "./store.js";

const sessionIdentifier = "session-261026-193506-ofk2";
const projectDirectory = "/projects/example";
const processes: ProcessInfo[] = [
  { pid: 10, parentPid: 1, name: "/Applications/IntelliJ IDEA.app/Contents/MacOS/idea", startedAt: "2026-10-26T08:00:00.000Z" },
];
const versionedProcesses: ProcessInfo[] = [
  { pid: 30, parentPid: 1, name: "/Applications/IntelliJ IDEA 2026.3.app/Contents/MacOS/idea", startedAt: "2026-10-26T10:00:00.000Z" },
  { pid: 20, parentPid: 1, name: "/Applications/IntelliJ IDEA 2026.2.3.app/Contents/MacOS/idea", startedAt: "2026-10-26T08:00:00.000Z" },
];
const directories: string[] = [];
const stores: SessionStore[] = [];

afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.close()));
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function statusLine(state: string): string {
  return JSON.stringify({ kind: "SessionA2uxEvent", event: { state, agentEvent: { kind: "AgentCurrentStatusUpdatedEvent" } } });
}

async function fixture(state: string) {
  const root = await mkdtemp(join(tmpdir(), "ai-ai-captain-junie-"));
  directories.push(root);
  await mkdir(join(root, sessionIdentifier));
  const now = Date.now();
  await writeFile(join(root, "index.jsonl"), `${JSON.stringify({ sessionId: sessionIdentifier, createdAt: now - 60_000, updatedAt: now, projectDir: projectDirectory, taskName: "Private task" })}\n`);
  await writeFile(join(root, sessionIdentifier, "events.jsonl"), `${statusLine("IN_PROGRESS")}\n${statusLine(state)}\n`);
  const store = new SessionStore();
  stores.push(store);
  return { store, tracker: new JunieTracker(store, root) };
}

const openProject: LifetimeInspector = async () => ({ status: "open", evidence: "JetBrains project registration", openedAt: Date.now() - 120_000 });
const closedProject: LifetimeInspector = async () => ({ status: "closed", evidence: "JetBrains project unregistered" });

describe("Junie tracking", () => {
  it("maps Junie status values to session states", () => {
    expect(junieEventState("IN_PROGRESS")).toBe("working");
    expect(junieEventState("COMPLETED")).toBe("done");
    expect(junieEventState("FAILED")).toBe("failed");
    expect(junieEventState("OTHER")).toBe("unknown");
    expect(junieEventState(undefined)).toBe("unknown");
  });

  it("uses the last status event in the log", () => {
    expect(lastJunieStatus(`${statusLine("IN_PROGRESS")}\n${statusLine("COMPLETED")}\n`)).toBe("COMPLETED");
    expect(lastJunieStatus("no status here")).toBeUndefined();
  });

  it("shows a working session in an open IntelliJ project", async () => {
    const { store, tracker } = await fixture("IN_PROGRESS");
    await tracker.scan(processes, openProject);
    const session = store.get(`junie:${sessionIdentifier}`);
    expect(session?.state).toBe("working");
    expect(session?.harness).toBe("intellij-ai");
    expect(session?.label).toBe("example · ofk2");
    expect(session?.focusTarget).toEqual({ pid: 10, appName: "IntelliJ IDEA", appPath: "/Applications/IntelliJ IDEA.app" });
    expect(JSON.stringify(session)).not.toContain("Private task");
  });

  it("targets the IDEA installation that has the Junie project open", async () => {
    const { store, tracker } = await fixture("IN_PROGRESS");
    const owningProject: LifetimeInspector = async ({ pid }) => pid === 20
      ? { status: "open", evidence: "JetBrains project registration", openedAt: Date.now() - 120_000 }
      : { status: "closed", evidence: "JetBrains project unregistered" };

    await tracker.scan(versionedProcesses, owningProject);

    expect(store.get(`junie:${sessionIdentifier}`)?.focusTarget).toEqual({
      pid: 20,
      appName: "IntelliJ IDEA",
      appPath: "/Applications/IntelliJ IDEA 2026.2.3.app",
    });
  });

  it.each([["COMPLETED", "done"], ["FAILED", "failed"]])("shows %s as %s", async (status, expected) => {
    const { store, tracker } = await fixture(status);
    await tracker.scan(processes, openProject);
    expect(store.get(`junie:${sessionIdentifier}`)?.state).toBe(expected);
  });

  it("hides the session when the project is closed", async () => {
    const { store, tracker } = await fixture("IN_PROGRESS");
    await tracker.scan(processes, closedProject);
    expect(store.get(`junie:${sessionIdentifier}`)).toBeUndefined();
  });

  it("hides the session when IntelliJ IDEA is not running", async () => {
    const { store, tracker } = await fixture("IN_PROGRESS");
    await tracker.scan([], openProject);
    expect(store.get(`junie:${sessionIdentifier}`)).toBeUndefined();
  });

  it("removes the session when the project closes later", async () => {
    const { store, tracker } = await fixture("IN_PROGRESS");
    await tracker.scan(processes, openProject);
    await tracker.scan(processes, closedProject);
    expect(store.get(`junie:${sessionIdentifier}`)).toBeUndefined();
  });

  it("shows no session when the Junie folder does not exist", async () => {
    const store = new SessionStore();
    stores.push(store);
    await new JunieTracker(store, join(tmpdir(), "ai-ai-captain-missing-junie")).scan(processes, openProject);
    expect(store.list()).toEqual([]);
  });
});

describe("Junie session info", () => {
  it("reads the latest context report", () => {
    const line = (percentage: number, used: number): string => `{"kind":"SessionA2uxEvent","event":{"agentEvent":{"kind":"ContextWindowReportEvent","agent":{"kind":"MainAgent","id":"main"},"percentage":${percentage},"used":${used},"size":1000000}}}`;
    expect(lastJunieContext(`${line(2.1, 21000)}\n${line(6.05, 60494)}\n`)).toEqual({ contextUsedPercent: 6, tokensUsed: 60494 });
    expect(lastJunieContext("none")).toBeUndefined();
  });

  it("reads the model and Brave mode from settings", () => {
    expect(parseJunieSettings('{"model":{"modelId":"claude-sonnet-5-5"},"braveMode":"ON"}')).toEqual({ model: "claude-sonnet-5-5", freedom: "full", approval: "never" });
    expect(parseJunieSettings('{"model":{"modelId":"m"},"braveMode":"OFF"}')).toEqual({ model: "m", freedom: "limited", approval: "asks" });
    expect(parseJunieSettings("not json")).toEqual({});
  });
});
