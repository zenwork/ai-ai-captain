import { describe, expect, it } from "vitest";
import type { Client, Session } from "../../src/shared/session.js";
import { appIconName, appImage, appSignature, infoImage, infoSignature, settingControlImage, settingControlSignature } from "./cards.js";

function client(id: string, name: string, bundleId?: string): Client {
  return { id, name, focusTarget: { appName: name, ...(bundleId ? { bundleId } : {}) }, sessionTracking: "unavailable" };
}

describe("app keys", () => {
  it("chooses the icon from the app identity", () => {
    expect(appIconName(client("desktop:chatgpt", "ChatGPT", "com.openai.codex"))).toBe("openai");
    expect(appIconName(client("desktop:claude", "Claude", "com.anthropic.claudefordesktop"))).toBe("claude");
    expect(appIconName(client("desktop:other", "Other"))).toBe("app-window");
  });

  it("renders an APP label with the key number and a title", () => {
    const image = appImage(client("desktop:chatgpt", "ChatGPT"), 3);
    expect(image).toContain(">APP<");
    expect(image).toContain("ChatGPT: app detected, sessions not tracked");
  });

  it("changes the signature when the key number changes", () => {
    const chatgpt = client("desktop:chatgpt", "ChatGPT");
    expect(appSignature(chatgpt, 1)).not.toBe(appSignature(chatgpt, 2));
  });
});

function session(overrides: Partial<Session>): Session {
  const timestamp = "2026-10-25T12:00:00.000Z";
  return { id: "codex:1", source: "codex-local", label: "Example", state: "working", createdAt: timestamp, updatedAt: timestamp, lastActivityAt: timestamp, ...overrides };
}

describe("info keys", () => {
  it("shows model and tokens, and describes the padlock and AUTO symbols", () => {
    const image = infoImage(session({ model: "gpt-5.5", tokensUsed: 148_000, contextUsedPercent: 62, freedom: "full", approval: "never" }));
    expect(image).toContain(">gpt-5.5<");
    expect(image).toContain(">148K<");
    expect(image).toContain("full freedom, never asks");
    expect(image).not.toContain(">FULL<");
    expect(image).not.toContain(">AUTO<");
  });

  it("abbreviates long model names", () => {
    expect(infoImage(session({ model: "claude-sonnet-5-5" }))).toContain(">son-5.5<");
    expect(infoImage(session({ model: "claude-opus-4-1-20250805" }))).toContain(">opus-4.1<");
  });

  it("shows no words for the freedom and approval symbols", () => {
    const image = infoImage(session({ model: "opus", contextUsedPercent: 38, freedom: "limited", approval: "asks" }));
    expect(image).toContain("limited freedom, asks for decisions");
    expect(image).not.toContain(">LIMIT<");
    expect(image).not.toContain(">AUTO<");
  });

  it("shows unknown markers when the host reports nothing", () => {
    const image = infoImage(session({}));
    expect(image).toContain("model not reported");
    expect(image).toContain("context not reported");
    expect(image).toContain("freedom not reported");
  });

  it("changes the signature when a value changes", () => {
    expect(infoSignature(session({ contextUsedPercent: 10 }))).not.toBe(infoSignature(session({ contextUsedPercent: 11 })));
  });
});

describe("setting keys", () => {
  const state = { palette: "fjord", flashIntensity: 2, showInfoKeys: true } as const;

  it("shows the info key state", () => {
    expect(settingControlImage("info-keys", state)).toContain(">ON<");
    expect(settingControlImage("info-keys", { ...state, showInfoKeys: false })).toContain(">OFF<");
  });

  it("shows the palette name and the brightness level", () => {
    expect(settingControlImage("theme", { ...state, palette: "nocturne" })).toContain(">Nocturne<");
    expect(settingControlImage("brightness", state)).toContain(">BRIGHT 2/4<");
  });

  it("changes the signature when a setting changes", () => {
    expect(settingControlSignature("theme", state)).not.toBe(settingControlSignature("theme", { ...state, palette: "signal" }));
  });
});
