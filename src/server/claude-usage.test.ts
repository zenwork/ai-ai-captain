import { describe, expect, it } from "vitest";
import { claudeUsageBudget, parseClaudeReset } from "./claude-usage.js";

// Sunday, 1 November 2026, 22:00 local time.
const now = new Date(2026, 10, 1, 22, 0).getTime();
const local = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute).toISOString();

describe("Claude Usage page", () => {
  it("reads the reset texts of the page in local time", () => {
    expect(parseClaudeReset("Resets Mon 12:50 AM", now)).toBe(local(2, 0, 50));
    expect(parseClaudeReset("Resets Sunday 5:00 PM", now)).toBe(local(8, 17));
    expect(parseClaudeReset("Resets Sunday 11:30 PM", now)).toBe(local(1, 23, 30));
    expect(parseClaudeReset("Resets 5:00 PM", now)).toBe(local(2, 17));
    expect(parseClaudeReset("Resets tomorrow 9 AM", now)).toBe(local(2, 9));
    expect(parseClaudeReset("Resets in 2 hr 10 min", now)).toBe(new Date(now + 130 * 60_000).toISOString());
    expect(parseClaudeReset("Resets in 45 min", now)).toBe(new Date(now + 45 * 60_000).toISOString());
  });

  it("gives no reset time for a text in another form", () => {
    for (const text of ["Resets soon", "Resets Funday 5:00 PM", "Resets 13:00 PM", "Zurücksetzen Mo 00:50", undefined]) expect(parseClaudeReset(text, now)).toBeUndefined();
  });

  it("makes the Claude budget from the two meters", () => {
    expect(claudeUsageBudget({ session: { percent: 46, reset: "Resets Mon 12:50 AM" }, week: { percent: 8 } }, "max", now)).toEqual({
      provider: "claude", source: "claude-desktop-usage", plan: "max",
      windows: [{ kind: "five-hour", usedPercent: 46, resetsAt: local(2, 0, 50) }, { kind: "weekly", usedPercent: 8 }],
    });
    expect(claudeUsageBudget({}, "max", now)).toBeUndefined();
  });
});
