import { open, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { BudgetInput } from "../shared/budget.js";
import type { BudgetStore } from "./budgets.js";

const tailBytes = 256 * 1024;
const newestFiles = 4;
const fiveHourMinutes = 300;
const weekMinutes = 10_080;

function fields(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function finite(value: unknown): number | undefined {
  const number = typeof value === "string" && value.trim() ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) ? number : undefined;
}

/**
 * Return the newest rollout files by change time. Codex keeps them in sessions/YYYY/MM/DD.
 * A resumed conversation writes into the folder of the day when it started, so all day folders are checked.
 * Only file times are read here. The file contents are read for the newest files only.
 */
async function newestRollouts(sessions: string): Promise<string[]> {
  const files: { path: string; time: number }[] = [];
  for (const directory of await dayDirectories(sessions)) files.push(...(await rolloutFiles(directory)));
  return files
    .sort((left, right) => right.time - left.time)
    .slice(0, newestFiles)
    .map((file) => file.path);
}

/** Returns the names of the entries that are only digits, such as the year, month, and day folders. */
async function numberedEntries(path: string): Promise<string[]> {
  return (await readdir(path).catch(() => [] as string[])).filter((name) => /^\d+$/.test(name));
}

/** Returns all sessions/YYYY/MM/DD folders. */
async function dayDirectories(sessions: string): Promise<string[]> {
  const directories: string[] = [];
  for (const year of await numberedEntries(sessions)) {
    for (const month of await numberedEntries(join(sessions, year))) {
      for (const day of await numberedEntries(join(sessions, year, month))) directories.push(join(sessions, year, month, day));
    }
  }
  return directories;
}

/** Returns the rollout files of one day folder with their change times. */
async function rolloutFiles(directory: string): Promise<{ path: string; time: number }[]> {
  const files: { path: string; time: number }[] = [];
  for (const name of await readdir(directory).catch(() => [] as string[])) {
    if (!/^rollout-.+\.jsonl$/.test(name)) continue;
    const path = join(directory, name);
    const info = await stat(path).catch(() => undefined);
    if (info?.isFile()) files.push({ path, time: info.mtimeMs });
  }
  return files;
}

async function tail(path: string): Promise<string> {
  const handle = await open(path, "r");
  try {
    const { size } = await handle.stat();
    const length = Math.min(size, tailBytes);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, size - length);
    return buffer.toString("utf8");
  } finally {
    await handle.close();
  }
}

/**
 * Change a Codex token_count event into a budget. Codex writes "rate_limits" with a primary and a secondary window.
 * Only the limit numbers, the plan type, and the credit balance are kept.
 */
export function codexBudgetFromEvent(value: unknown): { budget: BudgetInput; observedAt: string } | undefined {
  const event = fields(value);
  const payload = fields(event.payload);
  if (event.type !== "event_msg" || payload.type !== "token_count") return undefined;
  const limits = fields(payload.rate_limits);
  if (!Object.keys(limits).length) return undefined;
  if (limits.limit_id !== undefined && limits.limit_id !== null && limits.limit_id !== "codex") return undefined;
  const windows: BudgetInput["windows"] = [];
  for (const [index, name] of ["primary", "secondary"].entries()) {
    const window = fields(limits[name]);
    const usedPercent = finite(window.used_percent);
    if (usedPercent === undefined) continue;
    const minutes = finite(window.window_minutes);
    const kind = minutes === fiveHourMinutes ? "five-hour" : minutes === weekMinutes ? "weekly" : index === 0 ? "five-hour" : "weekly";
    const resetSeconds = finite(window.resets_at);
    windows.push({
      kind,
      usedPercent: Math.min(100, Math.max(0, usedPercent)),
      ...(resetSeconds !== undefined && resetSeconds > 0 ? { resetsAt: new Date(resetSeconds * 1000).toISOString() } : {}),
    });
  }
  if (!windows.length) return undefined;
  const credits = fields(limits.credits);
  const balance = finite(credits.balance);
  const limited =
    windows.some((window) => (window.usedPercent ?? 0) >= 100) || (typeof limits.rate_limit_reached_type === "string" && limits.rate_limit_reached_type !== "");
  const plan = typeof limits.plan_type === "string" && /^[\w-]{1,24}$/.test(limits.plan_type) ? limits.plan_type : undefined;
  const timestamp =
    typeof event.timestamp === "string" && Number.isFinite(Date.parse(event.timestamp)) ? new Date(event.timestamp).toISOString() : new Date(0).toISOString();
  return {
    observedAt: timestamp,
    budget: {
      provider: "openai",
      source: "codex-rollout",
      ...(plan ? { plan } : {}),
      windows,
      ...(credits.has_credits === true && balance !== undefined && balance > 0 && credits.unlimited !== true
        ? { extra: { kind: "topup" as const, active: limited, balance, currency: "credits" as const } }
        : {}),
    },
  };
}

/** Reads the newest Codex rate-limit snapshot from the rollout files and reports it as the OpenAI budget. */
/** Returns the last rate limit snapshot in the end of one rollout file. */
async function newestBudgetInFile(path: string): Promise<ReturnType<typeof codexBudgetFromEvent>> {
  const lines = (await tail(path).catch(() => "")).split("\n");
  for (let index = lines.length - 1; index >= 0; index--) {
    if (!lines[index].includes('"rate_limits"')) continue;
    const budget = budgetFromLine(lines[index]);
    if (budget) return budget;
  }
  return undefined;
}

/** Reads one rollout line. A line that is not JSON gives no budget. */
function budgetFromLine(line: string): ReturnType<typeof codexBudgetFromEvent> {
  try {
    return codexBudgetFromEvent(JSON.parse(line));
  } catch {
    return undefined;
  }
}

export class CodexBudgetReader {
  #lastObservedAt?: string;

  constructor(
    private readonly store: BudgetStore,
    private readonly codexHome: string,
  ) {}

  /** Read the newest snapshot. With force, report it again even when it did not change since the last scan. */
  async scan(force = false): Promise<void> {
    if (force) this.#lastObservedAt = undefined;
    let newest: { budget: BudgetInput; observedAt: string } | undefined;
    for (const path of await newestRollouts(join(this.codexHome, "sessions"))) {
      const found = await newestBudgetInFile(path);
      if (found && (!newest || found.observedAt > newest.observedAt)) newest = found;
    }
    if (!newest || newest.observedAt === this.#lastObservedAt) return;
    this.#lastObservedAt = newest.observedAt;
    this.store.upsert(newest.budget, newest.observedAt);
  }
}
