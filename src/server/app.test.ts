import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { z } from "zod";
import { clientSchema, sessionSchema, type FocusTarget } from "../shared/session.js";
import { budgetSchema } from "../shared/budget.js";
import { SessionStore } from "./store.js";
import { ClientRegistry } from "./clients.js";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Response bodies of the hub API. The tests validate each body against the shared contracts.
const responseSchemas = {
  session: z.object({ session: sessionSchema }),
  sessions: z.object({ sessions: z.array(sessionSchema) }),
  budget: z.object({ budget: budgetSchema }),
  budgets: z.object({ budgets: z.array(budgetSchema) }),
  clients: z.object({ clients: z.array(clientSchema) }),
};

function body<Schema extends z.ZodType>(response: { json: () => unknown }, schema: Schema): z.infer<Schema> {
  return schema.parse(response.json());
}

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
    expect(body(created, responseSchemas.session).session.id).toBe("codex:123");
    const listed = await app.inject({ method: "GET", url: "/api/sessions" });
    expect(body(listed, responseSchemas.sessions).sessions).toHaveLength(1);
    const mismatch = await app.inject({ method: "PUT", url: "/api/sessions/other", payload });
    expect(mismatch.statusCode).toBe(400);
  });

  it("ends a session with DONE or FAILED and rejects other end states", async () => {
    const app = createApp({ webRoot: "/no-static-assets" });
    apps.push(app);
    await app.inject({ method: "PUT", url: "/api/sessions/codex%3A1", payload: { id: "codex:1", source: "codex", label: "Task", state: "working" } });
    for (const payload of [{}, { state: "working" }, { state: ["done"] }]) {
      expect((await app.inject({ method: "POST", url: "/api/sessions/codex%3A1/end", payload })).statusCode).toBe(400);
    }
    expect((await app.inject({ method: "POST", url: "/api/sessions/codex%3A1/end" })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/api/sessions/none/end", payload: { state: "done" } })).statusCode).toBe(404);
    const ended = await app.inject({ method: "POST", url: "/api/sessions/codex%3A1/end", payload: { state: "failed" } });
    expect(body(ended, responseSchemas.session).session).toMatchObject({ id: "codex:1", state: "failed" });
  });

  it("stores subscription budgets, lists them with the sessions, and removes them", async () => {
    const app = createApp({ webRoot: "/no-static-assets" });
    apps.push(app);
    const payload = { provider: "claude", source: "cli", plan: "max", windows: [{ kind: "five-hour", usedPercent: 34, resetsAt: "2026-11-01T12:00:00Z" }] };
    const saved = await app.inject({ method: "PUT", url: "/api/budgets/claude", payload });
    expect(saved.statusCode).toBe(200);
    expect(body(saved, responseSchemas.budget).budget).toMatchObject({ provider: "claude", plan: "max" });
    expect(body(await app.inject({ method: "GET", url: "/api/sessions" }), responseSchemas.budgets).budgets).toHaveLength(1);
    expect((await app.inject({ method: "PUT", url: "/api/budgets/openai", payload })).statusCode).toBe(400);
    expect(
      (await app.inject({ method: "PUT", url: "/api/budgets/claude", payload: { ...payload, windows: [{ kind: "weekly", usedPercent: 140 }] } })).statusCode,
    ).toBe(400);
    expect((await app.inject({ method: "DELETE", url: "/api/budgets/claude" })).json()).toEqual({ removed: true });
    expect((await app.inject({ method: "DELETE", url: "/api/budgets/claude" })).statusCode).toBe(404);
    expect(body(await app.inject({ method: "GET", url: "/api/budgets" }), responseSchemas.budgets).budgets).toEqual([]);
  });

  it("dismisses a DONE, FAILED, or UNKNOWN session until its state changes", async () => {
    const store = new SessionStore();
    const app = createApp({ webRoot: "/no-static-assets", store });
    apps.push(app);
    const working = { id: "codex:1", source: "codex", label: "Review", state: "working" as const };
    store.upsert(working, "2026-11-01T09:00:00Z", "2026-11-01T09:00:00Z");
    expect((await app.inject({ method: "POST", url: "/api/sessions/none/dismiss" })).statusCode).toBe(404);
    // An active session cannot be dismissed.
    expect((await app.inject({ method: "POST", url: "/api/sessions/codex%3A1/dismiss" })).statusCode).toBe(409);
    store.upsert({ ...working, state: "unknown" });
    expect(body(await app.inject({ method: "POST", url: "/api/sessions/codex%3A1/dismiss" }), responseSchemas.session).session.dismissedAt).toBeDefined();
    store.upsert({ ...working, state: "failed" });
    expect(store.get("codex:1")?.dismissedAt).toBeUndefined();
    expect(store.dismiss("codex:1")?.dismissedAt).toBeDefined();
    store.upsert({ ...working, state: "done" }, "2026-11-01T10:00:00Z", "2026-11-01T10:00:00Z");
    const dismissed = await app.inject({ method: "POST", url: "/api/sessions/codex%3A1/dismiss" });
    expect(body(dismissed, responseSchemas.session).session.dismissedAt).toBeDefined();
    // A new report with the same state and completion keeps it hidden.
    expect(store.upsert({ ...working, state: "done" }, "2026-11-01T10:05:00Z", "2026-11-01T10:00:00Z").dismissedAt).toBeDefined();
    expect(store.upsert({ ...working, state: "done", metadata: { completionAttention: "none" } }).dismissedAt).toBeDefined();
    // New work brings it back.
    expect(store.upsert({ ...working, state: "working" }).dismissedAt).toBeUndefined();
    store.upsert({ ...working, state: "done" }, "2026-11-01T10:10:00Z", "2026-11-01T10:10:00Z");
    store.dismiss("codex:1");
    // A new completion time brings it back too.
    expect(store.upsert({ ...working, state: "done" }, "2026-11-01T10:20:00Z", "2026-11-01T10:20:00Z").dismissedAt).toBeUndefined();
  });

  it("marks a DONE session as attended until its state changes", async () => {
    const store = new SessionStore();
    const app = createApp({ webRoot: "/no-static-assets", store });
    apps.push(app);
    const working = { id: "codex:1", source: "codex", label: "Review", state: "working" as const };
    store.upsert(working, "2026-11-01T09:00:00Z", "2026-11-01T09:00:00Z");
    expect((await app.inject({ method: "POST", url: "/api/sessions/none/attend" })).statusCode).toBe(404);
    // Only a DONE session can be attended.
    expect((await app.inject({ method: "POST", url: "/api/sessions/codex%3A1/attend" })).statusCode).toBe(409);
    store.upsert({ ...working, state: "failed" });
    expect((await app.inject({ method: "POST", url: "/api/sessions/codex%3A1/attend" })).statusCode).toBe(409);
    store.upsert({ ...working, state: "done" }, "2026-11-01T10:00:00Z", "2026-11-01T10:00:00Z");
    expect(body(await app.inject({ method: "POST", url: "/api/sessions/codex%3A1/attend" }), responseSchemas.session).session.attendedAt).toBeDefined();
    // A new report of the same completion keeps it.
    expect(store.upsert({ ...working, state: "done" }, "2026-11-01T10:05:00Z", "2026-11-01T10:00:00Z").attendedAt).toBeDefined();
    // Any state change clears it.
    expect(store.upsert({ ...working, state: "working" }).attendedAt).toBeUndefined();
    store.upsert({ ...working, state: "done" }, "2026-11-01T10:10:00Z", "2026-11-01T10:10:00Z");
    store.attend("codex:1");
    // A new completion time clears it too.
    expect(store.upsert({ ...working, state: "done" }, "2026-11-01T10:20:00Z", "2026-11-01T10:20:00Z").attendedAt).toBeUndefined();
  });

  it("removes a session by request and reports missing sessions", async () => {
    const app = createApp({ webRoot: "/no-static-assets" });
    apps.push(app);
    const payload = { id: "stale", source: "cli", label: "Task", state: "working" };
    await app.inject({ method: "PUT", url: "/api/sessions/stale", payload });
    const removed = await app.inject({ method: "DELETE", url: "/api/sessions/stale" });
    expect(removed.json()).toEqual({ removed: true });
    expect(body(await app.inject({ method: "GET", url: "/api/sessions" }), responseSchemas.sessions).sessions).toEqual([]);
    expect((await app.inject({ method: "DELETE", url: "/api/sessions/stale" })).statusCode).toBe(404);
  });

  it("focuses the matching session target and reports missing sessions", async () => {
    const focused: FocusTarget[] = [];
    const projects: (string | undefined)[] = [];
    const app = createApp({
      webRoot: "/no-static-assets",
      focus: async (target, project) => {
        if (target) focused.push(target);
        projects.push(project);
        return { focused: true };
      },
    });
    apps.push(app);
    const payload = {
      id: "session",
      source: "cli",
      label: "Task",
      state: "waiting",
      project: "/projects/expected-project",
      focusTarget: { appName: "IntelliJ IDEA" },
    };
    await app.inject({ method: "PUT", url: "/api/sessions/session", payload });
    expect((await app.inject({ method: "POST", url: "/api/sessions/session/focus" })).json()).toEqual({ focused: true });
    expect(focused).toEqual([{ appName: "IntelliJ IDEA" }]);
    expect(projects).toEqual(["/projects/expected-project"]);
    expect((await app.inject({ method: "POST", url: "/api/sessions/missing/focus" })).statusCode).toBe(404);
  });

  it("focuses a detected app and reports missing apps", async () => {
    const focused: (FocusTarget | undefined)[] = [];
    const clients = new ClientRegistry();
    clients.replace([{ id: "desktop:chatgpt", name: "ChatGPT", focusTarget: { appName: "ChatGPT" }, sessionTracking: "unavailable" }]);
    const app = createApp({
      clients,
      webRoot: "/no-static-assets",
      focus: async (target) => {
        focused.push(target);
        return { focused: true };
      },
    });
    apps.push(app);
    expect((await app.inject({ method: "POST", url: "/api/clients/desktop:chatgpt/focus" })).json()).toEqual({ focused: true });
    expect(focused).toEqual([{ appName: "ChatGPT" }]);
    expect((await app.inject({ method: "POST", url: "/api/clients/missing/focus" })).statusCode).toBe(404);
  });

  it("serves the static client without rendering it on the server", async () => {
    const app = createApp();
    apps.push(app);
    const page = await app.inject({ method: "GET", url: "/" });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain("<session-panel></session-panel>");
    expect(page.body).not.toContain("active sessions</span>");
  });

  it("retains terminal states for ten seconds then removes them", async () => {
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
    await store.close();
    vi.useRealTimers();
  });

  it("preserves optional session metadata on sparse updates", async () => {
    const store = new SessionStore();
    store.upsert({
      id: "session",
      source: "test",
      label: "Task",
      state: "working",
      model: "gpt-5",
      project: "/repo",
      focusTarget: { appName: "IntelliJ IDEA" },
    });
    store.upsert({ id: "session", source: "test", label: "Task", state: "waiting", model: undefined, project: undefined, focusTarget: undefined });
    expect(store.get("session")).toMatchObject({ model: "gpt-5", project: "/repo", focusTarget: { appName: "IntelliJ IDEA" }, state: "waiting" });
    await store.close();
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
    const prior = {
      id: "codex:conversation",
      source: "codex-local",
      label: "Task",
      state: "done" as const,
      ended: false,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastActivityAt: timestamp,
      stateChangedAt: timestamp,
    };
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
    expect(body(await app.inject({ method: "GET", url: "/api/sessions" }), responseSchemas.sessions).sessions.map((session) => session.id)).toEqual([
      "copilot:conversation",
    ]);
    expect(body(await app.inject({ method: "GET", url: "/api/clients" }), responseSchemas.clients).clients.map((client) => client.id)).toEqual([
      "desktop:chatgpt",
    ]);
  });

  it("waits for live confirmation before restoring persisted running sessions", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ai-ai-captain-restore-"));
    const path = join(directory, "sessions.json");
    const timestamp = "2026-10-25T12:00:00.000Z";
    const prior = {
      id: "copilot:conversation",
      source: "copilot-local",
      label: "One conversation",
      state: "working" as const,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastActivityAt: timestamp,
    };
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
