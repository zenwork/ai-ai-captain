import { describe, expect, it } from "vitest";
import { budgetCardData, budgetSchema, formatCredits, formatResetIn, type Budget } from "./budget.js";

const now = Date.parse("2026-11-01T10:00:00Z");
const at = (minutes: number) => new Date(now + minutes * 60_000).toISOString();

function budget(value: Omit<Budget, "updatedAt">): Budget {
  return budgetSchema.parse({ ...value, updatedAt: new Date(now).toISOString() });
}

describe("budget formatting", () => {
  it("formats reset times and credit amounts for a 72 px key", () => {
    expect(formatResetIn(at(35), now)).toBe("0h35");
    expect(formatResetIn(at(13 * 60 + 5), now)).toBe("13h05");
    expect(formatResetIn(at(4 * 24 * 60 + 30), now)).toBe("4d");
    expect(formatResetIn(at(-1), now)).toBeUndefined();
    expect([formatCredits(420), formatCredits(17.43), formatCredits(1500), formatCredits(20), formatCredits(2_000_000)]).toEqual(["420", "17.4", "1.5K", "20", "2M"]);
  });

  it("shows 5-hour and weekly windows for Claude and OpenAI", () => {
    const data = budgetCardData("openai", budget({ provider: "openai", source: "test", plan: "plus", windows: [
      { kind: "weekly", usedPercent: 47, resetsAt: at(5 * 24 * 60 + 10) },
      { kind: "five-hour", usedPercent: 18, resetsAt: at(220) },
    ] }), now);
    expect(data).toEqual({ provider: "openai", plan: "PLUS", windows: [{ label: "5H", percent: 18, reset: "3h40" }, { label: "WK", percent: 47, reset: "5d" }] });
  });

  it("starts a window again at 0% after its reset time and shows all windows as not reported without a budget", () => {
    const data = budgetCardData("claude", budget({ provider: "claude", source: "test", windows: [{ kind: "five-hour", usedPercent: 90, resetsAt: at(-5) }, { kind: "weekly", usedPercent: 30, resetsAt: at(600) }] }), now);
    expect(data.windows).toEqual([{ label: "5H", percent: 0 }, { label: "WK", percent: 30, reset: "10h00" }]);
    expect(budgetCardData("claude", undefined, now)).toEqual({ provider: "claude", windows: [{ label: "5H" }, { label: "WK" }] });
  });

  it("shows monthly credits and paid extras only when they are in use", () => {
    const copilot = budgetCardData("copilot", budget({ provider: "copilot", source: "test", plan: "pro", windows: [{ kind: "monthly", resetsAt: at(6 * 24 * 60 + 1) }], credits: { used: 1500, total: 1500 }, extra: { kind: "extra", active: true, used: 12, limit: 20, currency: "usd" } }), now);
    expect(copilot).toEqual({ provider: "copilot", plan: "PRO", used: "1.5K", total: "1.5K", windows: [{ label: "MO", percent: 100, reset: "6d" }], extra: { kind: "extra", amount: "$12/20" } });
    const jetbrains = budgetCardData("jetbrains", budget({ provider: "jetbrains", source: "test", windows: [{ kind: "monthly" }], credits: { used: 6.1, total: 20 }, extra: { kind: "topup", active: false, balance: 4.2, currency: "credits" } }), now);
    expect(jetbrains.extra).toBeUndefined();
    expect(jetbrains).toMatchObject({ used: "6.1", total: "20", windows: [{ label: "MO", percent: 30.5 }] });
  });

  it("rejects values outside the limits", () => {
    expect(budgetSchema.safeParse({ provider: "openai", source: "x", windows: [{ kind: "weekly", usedPercent: 101 }], updatedAt: new Date(now).toISOString() }).success).toBe(false);
    expect(budgetSchema.safeParse({ provider: "other", source: "x", windows: [], updatedAt: new Date(now).toISOString() }).success).toBe(false);
  });
});
