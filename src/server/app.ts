import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { sessionInputSchema } from "../shared/session.js";
import type { FocusHandler } from "./focus.js";
import { focusTarget as defaultFocusHandler } from "./focus.js";
import { SessionStore } from "./store.js";
import { ClientRegistry } from "./clients.js";
import { SettingsStore } from "./settings.js";
import { settingsSchema } from "../shared/settings.js";
import { palettes } from "../shared/palette.js";
import { canonicalDashboardUrl, createDashboardController } from "./dashboard.js";

export interface AppOptions {
  store?: SessionStore;
  focus?: FocusHandler;
  webRoot?: string;
  clients?: ClientRegistry;
  settings?: SettingsStore;
  dashboard?: ReturnType<typeof createDashboardController>;
  dashboardUrl?: string;
  logLevel?: HubLogLevel;
}

export const hubLogLevels = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;
export type HubLogLevel = (typeof hubLogLevels)[number];

export function createApp(options: AppOptions = {}): FastifyInstance {
  const store = options.store ?? new SessionStore();
  const focus = options.focus ?? defaultFocusHandler;
  const clients = options.clients ?? new ClientRegistry();
  const settings = options.settings ?? new SettingsStore();
  const dashboard = options.dashboard ?? createDashboardController();
  const dashboardUrl = canonicalDashboardUrl(options.dashboardUrl ?? "http://127.0.0.1:43681/");
  const app = Fastify({ logger: { level: options.logLevel ?? "info" }, bodyLimit: 32 * 1024 });

  app.get("/health", async () => ({ ok: true }));
  app.get("/api/dashboard/browser", async (_request, reply) => {
    try { return { browser: await dashboard.getBrowser(dashboardUrl) }; }
    catch { return reply.code(503).send({ error: "Default browser detection is unavailable on this platform or macOS could not identify it" }); }
  });
  app.post("/api/dashboard/open", async (request, reply) => {
    if (request.headers.origin && request.headers.origin !== new URL(dashboardUrl).origin) return reply.code(403).send({ error: "Cross-origin dashboard opening is not allowed" });
    return dashboard.open(dashboardUrl);
  });
  app.get("/api/sessions", async () => ({ sessions: store.list(), clients: clients.list(), settings: settings.get() }));
  app.get("/api/clients", async () => ({ clients: clients.list() }));
  app.get("/api/settings", async () => ({ settings: settings.get(), palettes: palettes.map(({ id, name, mode, contrast }) => ({ id, name, mode, contrast })) }));
  app.put("/api/settings", async (request, reply) => {
    const parsed = settingsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Choose a supported palette" });
    return { settings: await settings.update(parsed.data) };
  });
  app.put("/api/sessions/:id", async (request, reply) => {
    const parsed = sessionInputSchema.safeParse(request.body);
    const { id } = request.params as { id: string };
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid session" });
    if (id !== parsed.data.id) return reply.code(400).send({ error: "Path ID must match session ID" });
    return { session: store.upsert(parsed.data) };
  });
  app.post("/api/sessions/:id/end", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body ?? {};
    if (typeof body !== "object" || body === null || !("state" in body) || !["done", "failed"].includes(String(body.state))) {
      return reply.code(400).send({ error: "State must be done or failed" });
    }
    const session = store.end(id, body.state as "done" | "failed");
    if (!session) return reply.code(404).send({ error: "Session not found" });
    return { session };
  });
  app.delete("/api/sessions/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!store.get(id)) return reply.code(404).send({ error: "Session not found" });
    store.remove(id);
    return { removed: true };
  });
  app.post("/api/sessions/:id/focus", async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = store.get(id);
    if (!session) return reply.code(404).send({ error: "Session not found" });
    return focus(session.focusTarget, session.project);
  });
  app.post("/api/clients/:id/focus", async (request, reply) => {
    const { id } = request.params as { id: string };
    const client = clients.list().find((candidate) => candidate.id === id);
    if (!client) return reply.code(404).send({ error: "App not found" });
    return focus(client.focusTarget, undefined);
  });
  app.get("/api/events", async (request, reply) => {
    reply.hijack();
    const response = reply.raw;
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    const send = (event: unknown) => response.write(`data: ${JSON.stringify(event)}\n\n`);
    send({ type: "snapshot", sessions: store.list(), clients: clients.list(), settings: settings.get() });
    const unsubscribe = store.subscribe(send);
    const unsubscribeClients = clients.subscribe((snapshot) => send({ type: "clients", clients: snapshot }));
    const unsubscribeSettings = settings.subscribe((value) => send({ type: "settings", settings: value }));
    const heartbeat = setInterval(() => response.write(": heartbeat\n\n"), 15_000);
    const cleanup = () => {
      clearInterval(heartbeat);
      unsubscribe();
      unsubscribeClients();
      unsubscribeSettings();
    };
    request.raw.on("close", cleanup);
  });

  const webRoot = options.webRoot ?? resolve(process.cwd(), "web");
  if (existsSync(webRoot)) {
    void app.register(fastifyStatic, { root: webRoot, prefix: "/" });
  }
  app.addHook("onClose", async () => store.close());
  app.addHook("onClose", async () => settings.close());
  return app;
}
