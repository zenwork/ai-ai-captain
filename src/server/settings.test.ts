import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "./app.js";
import { SettingsStore } from "./settings.js";
import { defaultPaletteId, palettes } from "../shared/palette.js";
import { defaultFlashIntensity, defaultSettings, type HubSettings } from "../shared/settings.js";

describe("palette settings", () => {
  const apps: ReturnType<typeof createApp>[] = [];
  const directories: string[] = [];
  const controllers: AbortController[] = [];

  afterEach(async () => {
    controllers.splice(0).forEach((controller) => controller.abort());
    await Promise.all(apps.splice(0).map((app) => app.close()));
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  async function location(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "ai-ai-captain-settings-"));
    directories.push(directory);
    return join(directory, "settings.json");
  }

  it("defaults to Fjord and exposes only supported palette choices", async () => {
    const app = createApp({ webRoot: "/no-static-assets" });
    apps.push(app);
    const result = await app.inject({ method: "GET", url: "/api/settings" });
    expect(result.statusCode).toBe(200);
    expect(result.json().settings).toEqual(defaultSettings);
    expect(result.json().palettes.map((palette: { id: string }) => palette.id)).toEqual(palettes.map((palette) => palette.id));
    expect((await app.inject({ method: "GET", url: "/api/sessions" })).json().settings).toEqual(defaultSettings);
  });

  it("validates updates and includes saved settings in the plugin's existing snapshot", async () => {
    const app = createApp({ webRoot: "/no-static-assets" });
    apps.push(app);
    for (const payload of [{ palette: "unsupported" }, {}, { palette: "signal", arbitrary: true }, { palette: 42 }, { palette: "<script>" }, { palette: defaultPaletteId, flashIntensity: 5 }, { palette: defaultPaletteId, flashIntensity: -1 }]) {
      expect((await app.inject({ method: "PUT", url: "/api/settings", payload })).statusCode).toBe(400);
    }
    expect((await app.inject({ method: "GET", url: "/api/settings" })).json().settings).toEqual(defaultSettings);
    for (const palette of palettes) {
      const result = await app.inject({ method: "PUT", url: "/api/settings", payload: { palette: palette.id } });
      expect(result.statusCode).toBe(200);
      expect(result.json()).toEqual({ settings: { palette: palette.id, flashIntensity: defaultFlashIntensity, showInfoKeys: true } });
      expect((await app.inject({ method: "GET", url: "/api/sessions" })).json().settings).toEqual({ palette: palette.id, flashIntensity: defaultFlashIntensity, showInfoKeys: true });
    }
    const intensity = await app.inject({ method: "PUT", url: "/api/settings", payload: { palette: "signal", flashIntensity: 4 } });
    expect(intensity.statusCode).toBe(200);
    expect(intensity.json()).toEqual({ settings: { palette: "signal", flashIntensity: 4, showInfoKeys: true } });
  });

  it("saves the info key toggle and keeps it when only the palette changes", async () => {
    const path = await location();
    const settings = new SettingsStore(path);
    await settings.update({ palette: "signal", showInfoKeys: false });
    expect(settings.get().showInfoKeys).toBe(false);
    await settings.update({ palette: "fjord" });
    expect(settings.get().showInfoKeys).toBe(false);
    await settings.close();
    const restored = new SettingsStore(path);
    await restored.load();
    expect(restored.get().showInfoKeys).toBe(false);
    await restored.close();
  });

  it("persists a machine-wide choice across restarts with owner-only permissions", async () => {
    const path = await location();
    const settings = new SettingsStore(path);
    await settings.load();
    expect(settings.get()).toEqual(defaultSettings);
    await settings.update({ palette: "porcelain" });
    await settings.close();
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    const restored = new SettingsStore(path);
    await restored.load();
    expect(restored.get()).toEqual({ palette: "porcelain", flashIntensity: defaultFlashIntensity, showInfoKeys: true });
    const copy = restored.get();
    copy.palette = "fjord";
    expect(restored.get().palette).toBe("porcelain");
    await restored.close();
  });

  it("loads a palette file that has no flash intensity and uses the default", async () => {
    const path = await location();
    await writeFile(path, JSON.stringify({ palette: "ember-ice" }));
    const settings = new SettingsStore(path);
    await settings.load();
    expect(settings.get()).toEqual({ palette: "ember-ice", flashIntensity: defaultFlashIntensity, showInfoKeys: true });
    await settings.update({ palette: "ember-ice", flashIntensity: 4 });
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ palette: "ember-ice", flashIntensity: 4, showInfoKeys: true });
    await settings.close();
  });

  it("serializes concurrent saves, avoids duplicate notifications, and supports returning to default", async () => {
    const path = await location();
    const settings = new SettingsStore(path);
    const changes: HubSettings[] = [];
    const unsubscribe = settings.subscribe((value) => changes.push(value));
    await Promise.all([settings.update({ palette: "nocturne" }), settings.update({ palette: "signal" }), settings.update({ palette: "signal" })]);
    expect(changes).toEqual([
      { palette: "nocturne", flashIntensity: defaultFlashIntensity, showInfoKeys: true },
      { palette: "signal", flashIntensity: defaultFlashIntensity, showInfoKeys: true },
    ]);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ palette: "signal", flashIntensity: defaultFlashIntensity, showInfoKeys: true });
    unsubscribe();
    await settings.update({ palette: defaultPaletteId });
    expect(changes).toEqual([
      { palette: "nocturne", flashIntensity: defaultFlashIntensity, showInfoKeys: true },
      { palette: "signal", flashIntensity: defaultFlashIntensity, showInfoKeys: true },
    ]);
    expect(settings.get()).toEqual(defaultSettings);
    await settings.close();
  });

  it("keeps the previous choice on a failed disk write and accepts later retries", async () => {
    const path = await location();
    await mkdir(path);
    const settings = new SettingsStore(path);
    const changes: string[] = [];
    settings.subscribe((value) => changes.push(value.palette));
    const app = createApp({ settings, webRoot: "/no-static-assets" });
    apps.push(app);
    const failed = await app.inject({ method: "PUT", url: "/api/settings", payload: { palette: "signal" } });
    expect(failed.statusCode).toBe(500);
    expect(settings.get().palette).toBe(defaultPaletteId);
    expect(changes).toEqual([]);
    await rm(path, { recursive: true });
    const retry = await app.inject({ method: "PUT", url: "/api/settings", payload: { palette: "signal" } });
    expect(retry.statusCode).toBe(200);
    expect(changes).toEqual(["signal"]);
  });

  it("sends settings in reconnect snapshots and broadcasts changes to connected dashboards", async () => {
    const settings = new SettingsStore();
    await settings.update({ palette: "nocturne" });
    const app = createApp({ settings, webRoot: "/no-static-assets" });
    apps.push(app);
    const address = await app.listen({ host: "127.0.0.1", port: 0 });
    const controller = new AbortController();
    controllers.push(controller);
    const response = await fetch(`${address}/api/events`, { signal: controller.signal });
    const reader = response.body!.getReader();
    const decode = (chunk: Uint8Array | undefined) => JSON.parse(new TextDecoder().decode(chunk).split("data: ")[1].split("\n\n")[0]);
    const snapshot = decode((await reader.read()).value);
    expect(snapshot).toMatchObject({ type: "snapshot", settings: { palette: "nocturne", flashIntensity: defaultFlashIntensity, showInfoKeys: true } });
    await app.inject({ method: "PUT", url: "/api/settings", payload: { palette: "signal", flashIntensity: 3 } });
    expect(decode((await reader.read()).value)).toEqual({ type: "settings", settings: { palette: "signal", flashIntensity: 3, showInfoKeys: true } });
    controller.abort();
    await reader.cancel().catch(() => {});
  });
});
