import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BudgetStore } from "./budgets.js";
import { CodexBudgetReader, codexBudgetFromEvent } from "./codex-budget.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

// The shape of a token_count event from a Codex rollout on macOS (values changed).
function event(timestamp: string, primary: number, secondary: number, extra: Record<string, unknown> = {}) {
  return {
    timestamp,
    type: "event_msg",
    payload: {
      type: "token_count",
      info: { total_token_usage: { total_tokens: 1000 } },
      rate_limits: {
        limit_id: "codex", limit_name: null,
        primary: { used_percent: primary, window_minutes: 300, resets_at: 1793069268 },
        secondary: { used_percent: secondary, window_minutes: 10080, resets_at: 1793603136 },
        credits: { has_credits: true, unlimited: false, balance: "105.6430912500" },
        individual_limit: null, spend_control_reached: null, plan_type: "plus", rate_limit_reached_type: null,
        ...extra,
      },
    },
  };
}

describe("Codex budget", () => {
  it("reads the 5-hour and weekly windows, the plan, and the credit balance", () => {
    const result = codexBudgetFromEvent(event("2026-10-26T22:33:13.480Z", 4, 1));
    expect(result).toEqual({
      observedAt: "2026-10-26T22:33:13.480Z",
      budget: {
        provider: "openai", source: "codex-rollout", plan: "plus",
        windows: [
          { kind: "five-hour", usedPercent: 4, resetsAt: new Date(1793069268 * 1000).toISOString() },
          { kind: "weekly", usedPercent: 1, resetsAt: new Date(1793603136 * 1000).toISOString() },
        ],
        extra: { kind: "topup", active: false, balance: 105.64309125, currency: "credits" },
      },
    });
  });

  it("marks the credits as in use when a limit is reached, and ignores other limits and events", () => {
    expect(codexBudgetFromEvent(event("2026-10-26T22:33:13Z", 100, 40))?.budget.extra?.active).toBe(true);
    expect(codexBudgetFromEvent(event("2026-10-26T22:33:13Z", 50, 40, { rate_limit_reached_type: "primary" }))?.budget.extra?.active).toBe(true);
    expect(codexBudgetFromEvent(event("2026-10-26T22:33:13Z", 50, 40, { limit_id: "other" }))).toBeUndefined();
    expect(codexBudgetFromEvent({ type: "event_msg", payload: { type: "agent_message", message: "private" } })).toBeUndefined();
  });

  it("reports the newest snapshot of the newest rollouts to the store", async () => {
    const home = await mkdtemp(join(tmpdir(), "ai-ai-captain-codex-"));
    directories.push(home);
    const day = join(home, "sessions", "2026", "10", "26");
    await mkdir(day, { recursive: true });
    const older = join(day, "rollout-a.jsonl");
    const newer = join(day, "rollout-b.jsonl");
    await writeFile(older, `${JSON.stringify(event("2026-10-26T20:00:00Z", 10, 5))}\n`);
    await writeFile(newer, [JSON.stringify(event("2026-10-26T21:00:00Z", 30, 8)), JSON.stringify({ type: "response_item", payload: { text: "private" } })].join("\n"));
    await utimes(older, new Date("2026-10-26T20:00:00Z"), new Date("2026-10-26T20:00:00Z"));
    const store = new BudgetStore();
    await new CodexBudgetReader(store, home).scan();
    const [budget] = store.list();
    expect(budget).toMatchObject({ provider: "openai", updatedAt: "2026-10-26T21:00:00.000Z", windows: [{ usedPercent: 30 }, { usedPercent: 8 }] });
    expect(JSON.stringify(store.list())).not.toContain("private");
  });
});
