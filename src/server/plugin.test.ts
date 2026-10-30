import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildSync } from "esbuild";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import type { Session } from "../shared/session.js";
import { getPalette, type PaletteId } from "../shared/palette.js";

interface TestKey {
  id: string;
  device: { id: string };
  coordinates: { row: number; column: number };
  isKey(): boolean;
  setImage: ReturnType<typeof vi.fn>;
  setTitle: ReturnType<typeof vi.fn>;
  showAlert: ReturnType<typeof vi.fn>;
}

interface TestAction {
  onWillAppear(event: { action: TestKey }): Promise<void>;
  onWillDisappear(event: { action: TestKey }): void;
  onKeyDown(event: { action: TestKey }): Promise<void>;
}

const sdk = { actions: [] as TestAction[], info: vi.fn(), warn: vi.fn(), openUrl: vi.fn(async (_url: string) => {}) };
let pluginCode: string;

beforeAll(() => {
  pluginCode = buildSync({
    entryPoints: [fileURLToPath(new URL("../../streamdeck/src/plugin.ts", import.meta.url))],
    bundle: true, platform: "node", format: "cjs", target: "node20", write: false, external: ["@elgato/streamdeck"],
  }).outputFiles[0].text;
});

function loadPlugin(): void {
  const nodeRequire = createRequire(import.meta.url);
  const require = (name: string) => {
    // The plugin can use Node.js built-in modules. It must bundle all other dependencies.
    if (name.startsWith("node:")) return nodeRequire(name);
    if (name !== "@elgato/streamdeck") throw new Error(`Unexpected plugin dependency: ${name}`);
    return {
      action: () => (constructor: unknown) => constructor,
      SingletonAction: class {},
      streamDeck: {
        actions: { registerAction: (action: TestAction) => sdk.actions.push(action) },
        logger: { info: sdk.info, warn: sdk.warn },
        system: { openUrl: sdk.openUrl },
        connect: async () => {},
      },
    };
  };
  new Function("require", pluginCode)(require);
}

const waiting: Session = {
  id: "needs-input", source: "codex-local", harness: "codex-ide", label: "Question", state: "waiting", metadata: { host: "IntelliJ IDEA" },
  createdAt: "2026-10-25T12:00:00.000Z", updatedAt: "2026-10-25T12:00:00.000Z", lastActivityAt: "2026-10-25T12:00:00.000Z",
};

function key(id: string, column: number): TestKey {
  return { id, device: { id: "stream-deck-xl" }, coordinates: { row: 0, column }, isKey: () => true, setImage: vi.fn(async () => {}), setTitle: vi.fn(async () => {}), showAlert: vi.fn(async () => {}) };
}

function lastImage(action: TestKey): string {
  const uri = action.setImage.mock.lastCall?.[0] as string;
  return Buffer.from(uri.split(",")[1], "base64").toString("utf8");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  sdk.actions.length = 0;
  sdk.info.mockClear();
  sdk.warn.mockClear();
  sdk.openUrl.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Stream Deck waiting animation", () => {
  it("pulses only waiting keys without increasing hub polling or logging every animation frame", async () => {
    vi.setSystemTime(1100);
    const completed = { ...waiting, id: "completed", state: "done", stateChangedAt: new Date(-600_000).toISOString() };
    const fetchSessions = vi.fn(async () => new Response(JSON.stringify({ sessions: [waiting, completed], settings: { flashIntensity: 0 } })));
    vi.stubGlobal("fetch", fetchSessions);
    loadPlugin();
    const action = sdk.actions[0];
    const waitingKey = key("waiting", 1);
    const doneKey = key("done", 0);
    await action.onWillAppear({ action: doneKey });
    await action.onWillAppear({ action: waitingKey });
    expect(lastImage(waitingKey)).toContain("#E3C291");
    expect(lastImage(doneKey)).toContain("#354B65");
    const requests = fetchSessions.mock.calls.length;
    const logs = sdk.info.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1200);
    expect(lastImage(waitingKey)).toContain("#B99D73");
    expect(lastImage(waitingKey)).toContain(">WAITING<");
    expect(doneKey.setImage).toHaveBeenCalledTimes(1);
    expect(fetchSessions).toHaveBeenCalledTimes(requests);
    expect(sdk.info).toHaveBeenCalledTimes(logs);
    await vi.advanceTimersByTimeAsync(300);
    expect(lastImage(waitingKey)).toContain("#B99D73");
    expect(waitingKey.setImage).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(900);
    expect(lastImage(waitingKey)).toContain("#E3C291");
    expect(doneKey.setImage).toHaveBeenCalledTimes(1);
    expect(fetchSessions).toHaveBeenCalledTimes(requests + 1);
  });

  it("stops pulsing when a session resumes working", async () => {
    let sessions = [waiting];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith("/api/dashboard/open") ? { opened: true, reused: true } : { sessions }))));
    loadPlugin();
    const action = sdk.actions[0];
    const sessionKey = key("session", 0);
    await action.onWillAppear({ action: sessionKey });
    expect(vi.getTimerCount()).toBe(2);
    sessions = [{ ...waiting, state: "working" }];
    await vi.advanceTimersByTimeAsync(1500);
    expect(lastImage(sessionKey)).toContain(">WORKING<");
    expect(vi.getTimerCount()).toBe(1);
    const imageCount = sessionKey.setImage.mock.calls.length;
    await vi.advanceTimersByTimeAsync(6000);
    expect(sessionKey.setImage).toHaveBeenCalledTimes(imageCount);
  });

  it("replaces the WAIT pulse with a fresh blue completion alert", async () => {
    let sessions = [waiting];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith("/api/dashboard/open") ? { opened: true, reused: true } : { sessions, settings: { flashIntensity: 0 } }))));
    loadPlugin();
    const sessionKey = key("session", 0);
    await sdk.actions[0].onWillAppear({ action: sessionKey });
    sessions = [{ ...waiting, state: "done", stateChangedAt: new Date(1500).toISOString() }];
    await vi.advanceTimersByTimeAsync(1500);
    expect(lastImage(sessionKey)).toContain("#B0D4EE");
    expect(vi.getTimerCount()).toBe(2);
    await vi.advanceTimersByTimeAsync(250);
    expect(lastImage(sessionKey)).toContain("#76A8CD");
    expect(lastImage(sessionKey)).not.toContain(">WAITING<");
  });

  it("slows completion flashes, ages after ten minutes, and does not restart on polling or reappearance", async () => {
    const completed = { ...waiting, state: "done", stateChangedAt: new Date(0).toISOString() };
    const fetchSessions = vi.fn(async () => new Response(JSON.stringify({ sessions: [{ ...completed, updatedAt: new Date().toISOString() }], settings: { flashIntensity: 0 } })));
    vi.stubGlobal("fetch", fetchSessions);
    loadPlugin();
    const action = sdk.actions[0];
    const sessionKey = key("session", 0);
    await action.onWillAppear({ action: sessionKey });
    expect(lastImage(sessionKey)).toContain("#B0D4EE");
    await vi.advanceTimersByTimeAsync(250);
    expect(lastImage(sessionKey)).toContain("#76A8CD");
    expect(fetchSessions).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(lastImage(sessionKey)).toContain("#76A8CD");
    const imageCount = sessionKey.setImage.mock.calls.length;
    await vi.advanceTimersByTimeAsync(500);
    expect(sessionKey.setImage).toHaveBeenCalledTimes(imageCount);
    await vi.advanceTimersByTimeAsync(250);
    expect(lastImage(sessionKey)).toContain("#B0D4EE");
    action.onWillDisappear({ action: sessionKey });
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(600_000 - Date.now());
    await action.onWillAppear({ action: sessionKey });
    expect(lastImage(sessionKey)).toContain("#354B65");
    expect(vi.getTimerCount()).toBe(1);
    const agedCount = sessionKey.setImage.mock.calls.length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(sessionKey.setImage).toHaveBeenCalledTimes(agedCount);
  });

  it("stops an active completion animation exactly at the ten-minute boundary", async () => {
    vi.setSystemTime(599_900);
    const completed = { ...waiting, state: "done", stateChangedAt: new Date(0).toISOString() };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ sessions: [completed] }))));
    loadPlugin();
    const sessionKey = key("session", 0);
    await sdk.actions[0].onWillAppear({ action: sessionKey });
    expect(lastImage(sessionKey)).toContain("#76A8CD");
    await vi.advanceTimersByTimeAsync(100);
    expect(lastImage(sessionKey)).toContain("#354B65");
    expect(vi.getTimerCount()).toBe(1);
  });

  it("stops timers when hidden and restarts cleanly when the key reappears", async () => {
    const fetchSessions = vi.fn(async () => new Response(JSON.stringify({ sessions: [waiting] })));
    vi.stubGlobal("fetch", fetchSessions);
    loadPlugin();
    const action = sdk.actions[0];
    const sessionKey = key("session", 0);
    await action.onWillAppear({ action: sessionKey });
    action.onWillDisappear({ action: sessionKey });
    expect(vi.getTimerCount()).toBe(0);
    const imageCount = sessionKey.setImage.mock.calls.length;
    await vi.advanceTimersByTimeAsync(6000);
    expect(sessionKey.setImage).toHaveBeenCalledTimes(imageCount);
    expect(fetchSessions).toHaveBeenCalledTimes(1);
    await action.onWillAppear({ action: sessionKey });
    expect(vi.getTimerCount()).toBe(2);
    expect(fetchSessions).toHaveBeenCalledTimes(2);
  });

  it("stops attention blinking rather than showing stale WAIT when the hub is unavailable", async () => {
    const fetchSessions = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ sessions: [waiting] }))).mockRejectedValue(new Error("Offline"));
    vi.stubGlobal("fetch", fetchSessions);
    loadPlugin();
    const sessionKey = key("session", 0);
    await sdk.actions[0].onWillAppear({ action: sessionKey });
    await vi.advanceTimersByTimeAsync(1500);
    expect(lastImage(sessionKey)).toContain(">UNK<");
    expect(vi.getTimerCount()).toBe(1);
  });
});

describe("live palette configuration", () => {
  it("updates session, empty, INFO, and paging keys on the existing poll without reappearance", async () => {
    let palette: PaletteId = "signal";
    const fetchSessions = vi.fn(async () => new Response(JSON.stringify({ sessions: [waiting], settings: { palette, flashIntensity: 0 } })));
    vi.stubGlobal("fetch", fetchSessions);
    loadPlugin();
    const sessionKey = key("session", 0);
    const empty = key("empty", 1);
    const info = key("info", 2);
    const previous = key("previous", 3);
    const next = key("next", 4);
    await sdk.actions[0].onWillAppear({ action: sessionKey });
    await sdk.actions[0].onWillAppear({ action: empty });
    await sdk.actions[3].onWillAppear({ action: info });
    await sdk.actions[1].onWillAppear({ action: previous });
    await sdk.actions[2].onWillAppear({ action: next });
    expect(lastImage(sessionKey)).toContain(getPalette(palette).states["waiting-bright"].accent);
    expect(lastImage(empty)).toContain(getPalette(palette).canvas);
    expect(lastImage(info)).toContain(getPalette(palette).controls.accent);
    const requests = fetchSessions.mock.calls.length;
    palette = "porcelain";
    await vi.advanceTimersByTimeAsync(1500);
    expect(fetchSessions).toHaveBeenCalledTimes(requests + 1);
    expect(lastImage(sessionKey)).toContain(getPalette(palette).states["waiting-dim"].accent);
    expect(lastImage(empty)).toContain(getPalette(palette).canvas);
    for (const control of [info, previous, next]) expect(lastImage(control)).toContain(getPalette(palette).controls.accent);
    expect(lastImage(next)).toContain(">1/1<");
    expect(lastImage(sessionKey)).toContain(">1<");
    expect(waiting.state).toBe("waiting");
  });

  it.each([1, 2, 3])("loads palettes even when only control action %i is visible and stops polling when hidden", async (index) => {
    let palette: PaletteId = "nocturne";
    const fetchSessions = vi.fn(async () => new Response(JSON.stringify({ sessions: [], settings: { palette } })));
    vi.stubGlobal("fetch", fetchSessions);
    loadPlugin();
    const control = key("only-control", 0);
    await sdk.actions[index].onWillAppear({ action: control });
    expect(lastImage(control)).toContain(getPalette(palette).controls.accent);
    palette = "porcelain";
    await vi.advanceTimersByTimeAsync(1500);
    expect(lastImage(control)).toContain(getPalette(palette).controls.accent);
    expect(vi.getTimerCount()).toBe(1);
    sdk.actions[index].onWillDisappear({ action: control });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retains the selected palette when the hub disconnects while marking sessions UNKNOWN", async () => {
    const fetchSessions = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ sessions: [waiting], settings: { palette: "signal" } }))).mockRejectedValue(new Error("Offline"));
    vi.stubGlobal("fetch", fetchSessions);
    loadPlugin();
    const sessionKey = key("session", 0);
    await sdk.actions[0].onWillAppear({ action: sessionKey });
    await vi.advanceTimersByTimeAsync(1500);
    expect(lastImage(sessionKey)).toContain(">UNK<");
    expect(lastImage(sessionKey)).toContain(getPalette("signal").states.unknown.accent);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("falls back to default artwork for an unsupported palette from an incompatible hub", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ sessions: [waiting], settings: { palette: "not-installed", flashIntensity: 0 } }))));
    loadPlugin();
    const sessionKey = key("session", 0);
    await sdk.actions[0].onWillAppear({ action: sessionKey });
    expect(lastImage(sessionKey)).toContain(getPalette().states["waiting-bright"].accent);
  });
});

describe("dashboard keys", () => {
  it("reuses the tab through the hub and opens a new tab after a permission failure", async () => {
    const request = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ opened: true, reused: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ opened: false, reason: "Accessibility permission required" })));
    vi.stubGlobal("fetch", request);
    loadPlugin();
    const info = key("info", 0);
    await sdk.actions[3].onKeyDown({ action: info });
    expect(info.showAlert).not.toHaveBeenCalled();
    await sdk.actions[3].onKeyDown({ action: info });
    expect(info.showAlert).not.toHaveBeenCalled();
    expect(sdk.warn).toHaveBeenCalledWith("Accessibility permission required");
    expect(sdk.openUrl).toHaveBeenCalledExactlyOnceWith("http://127.0.0.1:43681");
  });

  it("opens a new tab for older hubs and server errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("Not found", { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Failed" }), { status: 500 })));
    loadPlugin();
    const info = key("info", 0);
    await sdk.actions[3].onKeyDown({ action: info });
    expect(sdk.openUrl).toHaveBeenCalledOnce();
    await sdk.actions[3].onKeyDown({ action: info });
    expect(info.showAlert).not.toHaveBeenCalled();
    expect(sdk.openUrl).toHaveBeenCalledTimes(2);
  });

  it("does not open another tab when the hub already used its fallback", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ opened: true, reused: false, reason: "Tab reuse failed" }))));
    loadPlugin();
    const info = key("info", 0);
    await sdk.actions[3].onKeyDown({ action: info });
    expect(info.showAlert).not.toHaveBeenCalled();
    expect(sdk.openUrl).not.toHaveBeenCalled();
  });

  it("opens a new tab when the hub response is not valid JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("invalid")));
    loadPlugin();
    const info = key("info", 0);
    await sdk.actions[3].onKeyDown({ action: info });
    expect(sdk.openUrl).toHaveBeenCalledOnce();
    expect(info.showAlert).not.toHaveBeenCalled();
  });

  it("leaves unused session keys empty and never opens the dashboard from them", async () => {
    const fetchSessions = vi.fn(async () => new Response(JSON.stringify({ sessions: [waiting] })));
    vi.stubGlobal("fetch", fetchSessions);
    loadPlugin();
    const sessionKey = key("session", 0);
    const firstUnused = key("unused", 1);
    const blank = key("blank", 2);
    await sdk.actions[0].onWillAppear({ action: sessionKey });
    await sdk.actions[0].onWillAppear({ action: firstUnused });
    await sdk.actions[0].onWillAppear({ action: blank });
    expect(lastImage(firstUnused)).not.toContain(">INFO<");
    expect(lastImage(blank)).not.toContain(">INFO<");
    const requests = fetchSessions.mock.calls.length;
    await sdk.actions[0].onKeyDown({ action: firstUnused });
    await sdk.actions[0].onKeyDown({ action: blank });
    expect(sdk.openUrl).not.toHaveBeenCalled();
    expect(fetchSessions).toHaveBeenCalledTimes(requests);
  });

  it("keeps a custom INFO location fixed as sessions arrive and fills session keys around it", async () => {
    let sessions = [waiting];
    const fetchSessions = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith("/api/dashboard/open") ? { opened: true, reused: true } : { sessions })));
    vi.stubGlobal("fetch", fetchSessions);
    loadPlugin();
    const first = key("first", 0);
    const info = key("info", 1);
    const second = key("second", 2);
    const third = key("third", 3);
    await sdk.actions[0].onWillAppear({ action: first });
    await sdk.actions[3].onWillAppear({ action: info });
    await sdk.actions[0].onWillAppear({ action: second });
    await sdk.actions[0].onWillAppear({ action: third });
    sessions = [waiting, { ...waiting, id: "new-session", createdAt: "2026-10-25T12:00:01.000Z" }];
    await vi.advanceTimersByTimeAsync(1500);
    expect(lastImage(first)).toContain(">WAITING<");
    expect(lastImage(second)).toContain(">WAITING<");
    expect(lastImage(second)).toContain(">2<");
    expect(lastImage(third)).not.toContain(">INFO<");
    expect(lastImage(info)).toContain(">INFO<");
    expect(info.setImage).toHaveBeenCalledTimes(1);
    await sdk.actions[3].onKeyDown({ action: info });
    expect(fetchSessions).toHaveBeenLastCalledWith("http://127.0.0.1:43681/api/dashboard/open", expect.objectContaining({ method: "POST" }));
    expect(sdk.openUrl).not.toHaveBeenCalled();
  });

  it("provides a dedicated dashboard action that works without a connected hub", async () => {
    const fetchSessions = vi.fn().mockRejectedValue(new Error("Offline"));
    vi.stubGlobal("fetch", fetchSessions);
    loadPlugin();
    const dedicated = sdk.actions[3];
    const info = key("dedicated", 7);
    await dedicated.onWillAppear({ action: info });
    expect(lastImage(info)).toContain(">INFO<");
    await dedicated.onKeyDown({ action: info });
    expect(sdk.openUrl).toHaveBeenCalledWith("http://127.0.0.1:43681");
    expect(fetchSessions).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(1);
    dedicated.onWillDisappear({ action: info });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not add an automatic INFO key when there are no sessions", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ sessions: [] }))));
    loadPlugin();
    const first = key("first", 0);
    await sdk.actions[0].onWillAppear({ action: first });
    expect(lastImage(first)).not.toContain(">INFO<");
    await sdk.actions[0].onKeyDown({ action: first });
    expect(sdk.openUrl).not.toHaveBeenCalled();
  });

  it("pages and focuses every session when INFO and other controls occupy custom positions", async () => {
    const sessions = Array.from({ length: 3 }, (_unused, index) => ({ ...waiting, id: `session-${index}` }));
    const fetchSessions = vi.fn(async (_url: string, options?: RequestInit) => new Response(JSON.stringify(options?.method === "POST" ? { focused: true } : { sessions })));
    vi.stubGlobal("fetch", fetchSessions);
    loadPlugin();
    const first = key("first", 2);
    const info = key("info", 3);
    const second = key("second", 7);
    second.coordinates.row = 3;
    const next = key("next", 4);
    const previous = key("previous", 5);
    await sdk.actions[0].onWillAppear({ action: first });
    await sdk.actions[3].onWillAppear({ action: info });
    await sdk.actions[0].onWillAppear({ action: second });
    await sdk.actions[1].onWillAppear({ action: previous });
    await sdk.actions[2].onWillAppear({ action: next });
    expect(lastImage(first)).toContain(">1<");
    expect(lastImage(second)).toContain(">2<");
    expect(lastImage(next)).toContain(">1/2<");
    expect(lastImage(next)).toContain(">NEXT<");
    await sdk.actions[0].onKeyDown({ action: second });
    expect(fetchSessions).toHaveBeenLastCalledWith("http://127.0.0.1:43681/api/sessions/session-1/focus", expect.objectContaining({ method: "POST" }));
    await sdk.actions[2].onKeyDown({ action: next });
    expect(lastImage(first)).toContain(">3<");
    expect(lastImage(second)).not.toMatch(/>WAITING<|>INFO</);
    expect(lastImage(next)).toContain(">2/2<");
    await sdk.actions[0].onKeyDown({ action: first });
    expect(fetchSessions).toHaveBeenLastCalledWith("http://127.0.0.1:43681/api/sessions/session-2/focus", expect.objectContaining({ method: "POST" }));
    await sdk.actions[1].onKeyDown({ action: previous });
    expect(lastImage(first)).toContain(">1<");
    expect(lastImage(info)).toContain(">INFO<");
    expect(info.setImage).toHaveBeenCalledTimes(1);
  });

  it("keeps session layouts and paging independent across devices", async () => {
    const sessions = Array.from({ length: 3 }, (_unused, index) => ({ ...waiting, id: `session-${index}` }));
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith("/api/dashboard/open") ? { opened: true, reused: true } : { sessions }))));
    loadPlugin();
    const first = key("first", 0);
    const second = key("second", 2);
    const other = key("other", 0);
    other.device.id = "another-deck";
    const next = key("next", 7);
    await sdk.actions[0].onWillAppear({ action: first });
    await sdk.actions[0].onWillAppear({ action: second });
    await sdk.actions[0].onWillAppear({ action: other });
    await sdk.actions[2].onWillAppear({ action: next });
    await sdk.actions[2].onKeyDown({ action: next });
    expect(lastImage(first)).toContain(">3<");
    expect(lastImage(other)).toContain(">1<");
  });

  it("alerts when the OS cannot open the dashboard", async () => {
    sdk.openUrl.mockRejectedValueOnce(new Error("Could not launch browser"));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Offline")));
    loadPlugin();
    const info = key("dedicated", 0);
    await sdk.actions[3].onKeyDown({ action: info });
    expect(info.showAlert).toHaveBeenCalledOnce();
  });

  it("uses the configured hub URL for the dedicated dashboard shortcut", async () => {
    vi.stubEnv("AI_AI_CAPTAIN_URL", "http://127.0.0.1:54321");
    const fetchDashboard = vi.fn(async () => new Response(JSON.stringify({ opened: true, reused: true })));
    vi.stubGlobal("fetch", fetchDashboard);
    loadPlugin();
    await sdk.actions[3].onKeyDown({ action: key("dedicated", 0) });
    expect(fetchDashboard).toHaveBeenCalledWith("http://127.0.0.1:54321/api/dashboard/open", expect.objectContaining({ method: "POST" }));
    expect(sdk.openUrl).not.toHaveBeenCalled();
  });

  it("never replaces a real session with INFO on a full session page", async () => {
    const sessions = Array.from({ length: 30 }, (_unused, index) => ({ ...waiting, id: `session-${String(index).padStart(2, "0")}` }));
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith("/api/dashboard/open") ? { opened: true, reused: true } : { sessions }))));
    loadPlugin();
    const keys = Array.from({ length: 30 }, (_unused, index) => {
      const action = key(`key-${index}`, index % 8);
      action.coordinates.row = Math.floor(index / 8);
      return action;
    });
    for (const action of keys) await sdk.actions[0].onWillAppear({ action });
    const last = keys[29];
    expect(lastImage(last)).toContain(">WAITING<");
    expect(lastImage(last)).toContain(">30<");
    expect(lastImage(last)).not.toContain(">INFO<");
  });
});
