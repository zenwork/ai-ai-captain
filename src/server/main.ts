import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { createApp, hubLogLevels } from "./app.js";
import { startSessionDiscovery } from "./discovery.js";
import { ClientRegistry } from "./clients.js";
import { SessionStore } from "./store.js";
import { SettingsStore } from "./settings.js";
import { watchParentProcess } from "./parent-process.js";
import { resolveDataDirectory } from "./data-directory.js";

const logLevelSchema = z.enum(hubLogLevels).default("info");

async function run(): Promise<void> {
  const dataDirectory = await resolveDataDirectory({ configuredDirectory: process.env.AI_AI_CAPTAIN_DATA_DIR, homeDirectory: homedir(), log: console.info });
  const store = new SessionStore(join(dataDirectory, "sessions.json"));
  await store.load();
  const settings = new SettingsStore(join(dataDirectory, "settings.json"));
  await settings.load();
  const clients = new ClientRegistry();
  const discoveryTimer = startSessionDiscovery(store, clients, dataDirectory);
  const webRoot = process.env.AI_AI_CAPTAIN_WEB_DIR ?? join(process.cwd(), "web");
  const port = Number(process.env.AI_AI_CAPTAIN_PORT ?? 43681);
  const logLevel = logLevelSchema.parse(process.env.AI_AI_CAPTAIN_LOG_LEVEL);
  const app = createApp({ store, webRoot, clients, settings, logLevel, dashboardUrl: `http://127.0.0.1:${port}/` });
  app.addHook("onClose", async () => { if (discoveryTimer) clearInterval(discoveryTimer); });
  await app.listen({ host: "127.0.0.1", port });
  console.info(`AI AI Captain hub listening on http://127.0.0.1:${port}`);

  // The Stream Deck plugin sets this value when it starts the hub. The hub must not continue without the plugin.
  if (process.env.AI_AI_CAPTAIN_EXIT_WITH_PARENT === "1") {
    const shutDown = (): void => {
      void app.close().finally(() => process.exit(0));
    };
    watchParentProcess(shutDown);
    process.once("SIGTERM", shutDown);
  }
}

void run().catch((error: unknown) => {
  console.error("AI AI Captain hub failed to start", error);
  // The discovery timer can keep a failed hub alive. Stop the process, so that a supervisor can start a new hub.
  process.exit(1);
});
