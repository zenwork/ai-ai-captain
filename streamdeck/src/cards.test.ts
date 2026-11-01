import { describe, expect, it } from "vitest";
import type { Client, Session } from "../../src/shared/session.js";
import { appIconName, appImage, appSignature, budgetImage, budgetSignature, infoImage, infoPlaceholderImage, sessionPlaceholderImage, infoSignature, settingControlImage, settingControlSignature } from "./cards.js";

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

describe("budget keys", () => {
  const now = Date.parse("2026-11-01T10:00:00Z");
  const budget = {
    provider: "openai" as const, source: "codex-rollout", plan: "plus", updatedAt: "2026-11-01T09:59:00Z",
    windows: [{ kind: "five-hour" as const, usedPercent: 82, resetsAt: "2026-11-01T10:35:00Z" }, { kind: "weekly" as const, usedPercent: 60, resetsAt: "2026-11-06T10:00:00Z" }],
  };

  it("renders the plan, both windows, the reset time, and the percent of the window nearest to its limit", () => {
    const image = budgetImage("openai", budget, "fjord", now);
    expect(image).toContain(">PLUS<");
    expect(image).toContain(">5H<");
    expect(image).toContain(">WK<");
    expect(image).toContain(">0h35<");
    expect(image).toContain(">82%<");
    expect(image).toContain("OPENAI PLUS budget: 5H 82 percent used, resets in 0h35; WK 60 percent used, resets in 5d");
  });

  it("shows LIMIT at 100% and dashed bars without a budget", () => {
    const limited = budgetImage("openai", { ...budget, windows: [{ ...budget.windows[0], usedPercent: 100 }, budget.windows[1]] }, "fjord", now);
    expect(limited).toContain(">LIMIT<");
    const missing = budgetImage("copilot", undefined, "fjord", now);
    expect(missing).toContain("stroke-dasharray");
    expect(missing).toContain("GITHUB COPILOT plan not reported budget: MO not reported");
  });

  it("changes the signature when the reset time changes, but not within the same minute", () => {
    // 34:50 and 34:20 before the reset both show 0h34. 33:50 shows 0h33.
    expect(budgetSignature("openai", budget, "fjord", now + 10_000)).toBe(budgetSignature("openai", budget, "fjord", now + 40_000));
    expect(budgetSignature("openai", budget, "fjord", now + 10_000)).not.toBe(budgetSignature("openai", budget, "fjord", now + 70_000));
  });
});

describe("placeholder keys", () => {
  it("shows only a faint outline and the key number on an unused session key", () => {
    const image = sessionPlaceholderImage(7, "fjord");
    expect(image).toContain(">7<");
    expect(image).not.toContain(">SESSION<");
    expect(image).toContain('opacity=".45"');
    expect(image).toContain("Unused session key 7");
    expect(sessionPlaceholderImage(undefined, "fjord")).not.toContain(">undefined<");
  });

  it("shows the outline of the info key on an unused info key", () => {
    const image = infoPlaceholderImage("porcelain");
    expect(image).toContain(">INFO<");
    expect(image).toContain("stroke-dasharray");
  });
});
