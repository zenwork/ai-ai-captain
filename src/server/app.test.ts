import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import type { FocusTarget } from "../shared/session.js";
import { SessionStore } from "./store.js";
import { ClientRegistry } from "./clients.js";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("session API", () => {
  const apps: ReturnType<typeof createApp>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("upserts and lists sessions while validating the path ID", async () => {
    const app = createApp({ webRoot: "/no-static-assets" });
    apps.push(app);
    const payload = { id: "codex:123", source: "codex", label: "Refactor", state: "working" };
    const created = await app.inject({ method: "PUT", url: "/api/sessions/codex%3A123", payload });
    expect(created.statusCode).toBe(200);
    expect(created.json().session.id).toBe("codex:123");
    const listed = await app.inject({ method: "GET", url: "/api/sessions" });
    expect(listed.json().sessions).toHaveLength(1);
    const mismatch = await app.inject({ method: "PUT", url: "/api/sessions/other", payload });
    expect(mismatch.statusCode).toBe(400);
  });

  it("removes a session by request and reports missing sessions", async () => {
    const app = createApp({ webRoot: "/no-static-assets" });
    apps.push(app);
    const payload = { id: "stale", source: "cli", label: "Task", state: "working" };
    await app.inject({ method: "PUT", url: "/api/sessions/stale", payload });
    const removed = await app.inject({ method: "DELETE", url: "/api/sessions/stale" });
    expect(removed.json()).toEqual({ removed: true });
    expect((await app.inject({ method: "GET", url: "/api/sessions" })).json().sessions).toEqual([]);
    expect((await app.inject({ method: "DELETE", url: "/api/sessions/stale" })).statusCode).toBe(404);
  });

  it("focuses the matching session target and reports missing sessions", async () => {
    const focused: FocusTarget[] = [];
    const projects: Array<string | undefined> = [];
    const app = createApp({ webRoot: "/no-static-assets", focus: async (target, project) => {
      if (target) focused.push(target);
      projects.push(project);
      return { focused: true };
    } });
    apps.push(app);
    const payload = { id: "session", source: "cli", label: "Task", state: "waiting", project: "/projects/expected-project", focusTarget: { appName: "IntelliJ IDEA" } };
    await app.inject({ method: "PUT", url: "/api/sessions/session", payload });
    expect((await app.inject({ method: "POST", url: "/api/sessions/session/focus" })).json()).toEqual({ focused: true });
    expect(focused).toEqual([{ appName: "IntelliJ IDEA" }]);
    expect(projects).toEqual(["/projects/expected-project"]);
    expect((await app.inject({ method: "POST", url: "/api/sessions/missing/focus" })).statusCode).toBe(404);
  });

  it("serves the static client without rendering it on the server", async () => {
    const app = createApp();
    apps.push(app);
    const page = await app.inject({ method: "GET", url: "/" });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain("<session-panel></session-panel>");
    expect(page.body).not.toContain("active sessions</span>");
  });

  it("retains terminal states for ten seconds then removes them", () => {
    vi.useFakeTimers();
    const store = new SessionStore();
    const events: string[] = [];
    store.subscribe((event) => events.push(event.type));
    store.upsert({ id: "done", source: "test", label: "Task", state: "done" });
    expect(store.get("done")).toBeDefined();
    vi.advanceTimersByTime(9_999);
    expect(store.get("done")).toBeDefined();
    vi.advanceTimersByTime(1);
    expect(store.get("done")).toBeUndefined();
    expect(events).toEqual(["upsert", "remove"]);
    store.close();
    vi.useRealTimers();
  });

  it("preserves optional session metadata on sparse updates", () => {
    const store = new SessionStore();
    store.upsert({ id: "session", source: "test", label: "Task", state: "working", model: "gpt-5", project: "/repo", focusTarget: { appName: "IntelliJ IDEA" } });
    store.upsert({ id: "session", source: "test", label: "Task", state: "waiting", model: undefined, project: undefined, focusTarget: undefined });
    expect(store.get("session")).toMatchObject({ model: "gpt-5", project: "/repo", focusTarget: { appName: "IntelliJ IDEA" }, state: "waiting" });
    store.close();
  });

  it("keeps a completed open session blue until it resumes or actually closes", () => {
    vi.useFakeTimers();
    const store = new SessionStore();
    try {
      store.upsert({ id: "session", source: "test", label: "Task", state: "done", ended: false });
      vi.advanceTimersByTime(60_000);
      expect(store.get("session")).toMatchObject({ state: "done", ended: false });
      store.upsert({ id: "session", source: "test", label: "Task", state: "working", ended: false });
      expect(store.get("session")?.state).toBe("working");
      store.end("session");
      expect(store.get("session")).toMatchObject({ state: "done", ended: true });
      vi.advanceTimersByTime(10_000);
      expect(store.get("session")).toBeUndefined();
    } finally {
      void store.close();
      vi.useRealTimers();
    }
  });

  it("preserves completion age through metadata updates and records a new completion after another turn", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-25T12:00:00.000Z"));
    const store = new SessionStore();
    const input = { id: "task", source: "test", label: "Task", state: "done" as const, ended: false };
    try {
      const first = store.upsert(input).stateChangedAt;
      vi.advanceTimersByTime(600_000);
      expect(store.upsert({ ...input, model: "another-model" }).stateChangedAt).toBe(first);
      store.upsert({ ...input, state: "working" });
      vi.advanceTimersByTime(1000);
      const second = store.upsert(input).stateChangedAt;
      expect(second).not.toBe(first);
      const rapidCompletion = new Date(Date.now() + 500).toISOString();
      vi.advanceTimersByTime(1500);
      expect(store.upsert(input, new Date().toISOString(), rapidCompletion).stateChangedAt).toBe(rapidCompletion);
    } finally {
      await store.close();
      vi.useRealTimers();
    }
  });

  it("requires live confirmation before restoring a completed open conversation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ai-ai-captain-completed-"));
    const path = join(directory, "sessions.json");
    const timestamp = "2026-10-25T12:00:00.000Z";
    const prior = { id: "codex:conversation", source: "codex-local", label: "Task", state: "done" as const, ended: false, createdAt: timestamp, updatedAt: timestamp, lastActivityAt: timestamp, stateChangedAt: timestamp };
    const store = new SessionStore(path);
    try {
      await writeFile(path, JSON.stringify([prior]));
      await store.load();
      expect(store.list()).toEqual([]);
      store.upsert(prior, timestamp);
      expect(store.list()).toHaveLength(1);
      expect(store.get(prior.id)).toMatchObject({ state: "done", ended: false, createdAt: timestamp, stateChangedAt: timestamp });
    } finally {
      await store.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("keeps detected applications separate from individually reported sessions", async () => {
    const clients = new ClientRegistry();
    clients.replace([{ id: "desktop:chatgpt", name: "ChatGPT", focusTarget: { appName: "ChatGPT" }, sessionTracking: "unavailable" }]);
    const store = new SessionStore();
    store.upsert({ id: "copilot:conversation", source: "copilot-local", label: "One conversation", state: "working" });
    const app = createApp({ store, clients, webRoot: "/no-static-assets" });
    apps.push(app);
    expect((await app.inject({ method: "GET", url: "/api/sessions" })).json().sessions.map((session: { id: string }) => session.id)).toEqual(["copilot:conversation"]);
    expect((await app.inject({ method: "GET", url: "/api/clients" })).json().clients.map((client: { id: string }) => client.id)).toEqual(["desktop:chatgpt"]);
  });

  it("waits for live confirmation before restoring persisted running sessions", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ai-ai-captain-restore-"));
    const path = join(directory, "sessions.json");
    const timestamp = "2026-10-25T12:00:00.000Z";
    const prior = { id: "copilot:conversation", source: "copilot-local", label: "One conversation", state: "working" as const, createdAt: timestamp, updatedAt: timestamp, lastActivityAt: timestamp };
    try {
      await writeFile(path, JSON.stringify([prior, { ...prior, id: "desktop:copilot", source: "desktop-app" }]));
      const store = new SessionStore(path);
      await store.load();
      expect(store.list()).toEqual([]);
      expect(store.get("desktop:copilot")).toBeUndefined();
      store.upsert({ ...prior, state: "waiting" }, timestamp);
      expect(store.list()).toHaveLength(1);
      expect(store.list()[0]).toMatchObject({ state: "waiting", lastActivityAt: timestamp });
      await store.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
