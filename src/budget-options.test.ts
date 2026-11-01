import { describe, expect, it } from "vitest";
import { budgetFromOptions } from "./budget-options.js";

const now = Date.parse("2026-11-01T10:00:00Z");

describe("report budget", () => {
  it("makes a Claude budget with relative reset times", () => {
    expect(budgetFromOptions("claude", ["claude", "--plan", "max", "--five-hour-percent", "34", "--five-hour-reset", "2h", "--weekly-percent", "21", "--weekly-reset", "4d"], now)).toEqual({
      provider: "claude", source: "cli", plan: "max",
      windows: [
        { kind: "five-hour", usedPercent: 34, resetsAt: "2026-11-01T12:00:00.000Z" },
        { kind: "weekly", usedPercent: 21, resetsAt: "2026-11-05T10:00:00.000Z" },
      ],
    });
  });

  it("makes Copilot extra spend and JetBrains top-up credits", () => {
    expect(budgetFromOptions("copilot", ["copilot", "--credits-used", "1500", "--credits-total", "1500", "--monthly-reset", "2026-11-07T00:00:00Z", "--extra-used", "12", "--extra-limit", "20", "--extra-usd"], now)).toMatchObject({
      credits: { used: 1500, total: 1500 }, windows: [{ kind: "monthly", resetsAt: "2026-11-07T00:00:00.000Z" }], extra: { kind: "extra", active: true, used: 12, limit: 20, currency: "usd" },
    });
    expect(budgetFromOptions("jetbrains", ["jetbrains", "--credits-used", "20", "--credits-total", "20", "--top-up", "4.2", "--extra-active"], now).extra).toEqual({ kind: "topup", active: true, balance: 4.2, currency: "credits" });
  });

  it("rejects an unknown provider", () => {
    expect(() => budgetFromOptions("other", ["other"], now)).toThrow();
  });
});
