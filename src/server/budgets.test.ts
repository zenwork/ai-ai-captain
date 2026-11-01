import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BudgetStore } from "./budgets.js";
import { createApp } from "./app.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

async function directory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "ai-ai-captain-budgets-"));
  directories.push(path);
  return path;
}

const claude = { provider: "claude" as const, source: "cli", plan: "max", windows: [{ kind: "five-hour" as const, usedPercent: 34, resetsAt: "2026-11-01T12:00:00.000Z" }] };

describe("budget persistence", () => {
  it("saves reported budgets and reads them after a restart", async () => {
    const path = join(await directory(), "budgets.json");
    const first = new BudgetStore(path);
    first.upsert(claude, "2026-11-01T10:00:00.000Z");
    await first.close();
    const second = new BudgetStore(path);
    await second.load();
    expect(second.list()).toEqual([{ ...claude, updatedAt: "2026-11-01T10:00:00.000Z" }]);
    second.remove("claude");
    await second.close();
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual([]);
  });

  it("ignores a damaged file and entries that are not valid", async () => {
    const path = join(await directory(), "budgets.json");
    await writeFile(path, "{not json");
    const damaged = new BudgetStore(path);
    await damaged.load();
    expect(damaged.list()).toEqual([]);
    await writeFile(path, JSON.stringify([{ ...claude, updatedAt: "2026-11-01T10:00:00.000Z" }, { provider: "other", windows: [] }]));
    const partial = new BudgetStore(path);
    await partial.load();
    expect(partial.list().map((budget) => budget.provider)).toEqual(["claude"]);
  });

  it("reads the automatic sources again when the plugin asks for it", async () => {
    let refreshed = 0;
    const budgets = new BudgetStore();
    const app = createApp({ webRoot: "/no-static-assets", budgets, refreshBudgets: async () => { refreshed++; budgets.upsert(claude); } });
    const response = await app.inject({ method: "POST", url: "/api/budgets/refresh" });
    expect(refreshed).toBe(1);
    expect(response.json().budgets).toHaveLength(1);
    await app.close();
  });
});
