import { describe, expect, it } from "vitest";
import type { Client } from "../../src/shared/session.js";
import { appIconName, appImage, appSignature } from "./cards.js";

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
