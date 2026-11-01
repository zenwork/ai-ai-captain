import { z } from "zod";
import { budgetProviders, type BudgetCardData, type BudgetProviderId, type BudgetWindowCard } from "./card-design.js";

export const budgetProviderIds = budgetProviders.map((provider) => provider.id) as [BudgetProviderId, ...BudgetProviderId[]];
export const budgetWindowKinds = ["five-hour", "weekly", "monthly"] as const;
export type BudgetWindowKind = (typeof budgetWindowKinds)[number];

const percentSchema = z.number().finite().min(0).max(100);
const amountSchema = z.number().finite().min(0).max(1_000_000_000);

export const budgetWindowSchema = z.object({
  kind: z.enum(budgetWindowKinds),
  usedPercent: percentSchema.optional(),
  resetsAt: z.string().datetime().optional(),
});

/**
 * One subscription budget. The hub keeps only numbers, plan names, and reset times (ARCH-08).
 * - credits: credits used and the allowance of a monthly or 30-day window.
 * - extra: paid use after the allowance. "extra" is extra spend up to a limit (Copilot).
 *   "topup" is a balance of bought credits (JetBrains AI, Codex credits). Active means that it is in use now.
 */
export const budgetInputSchema = z.object({
  provider: z.enum(budgetProviderIds),
  source: z.string().trim().min(1).max(80),
  plan: z.string().trim().min(1).max(24).optional(),
  windows: z.array(budgetWindowSchema).max(3),
  credits: z.object({ used: amountSchema, total: amountSchema.positive() }).optional(),
  extra: z.object({
    kind: z.enum(["extra", "topup"]),
    active: z.boolean(),
    used: amountSchema.optional(),
    limit: amountSchema.optional(),
    balance: amountSchema.optional(),
    currency: z.enum(["usd", "credits"]).optional(),
  }).optional(),
});
export type BudgetInput = z.infer<typeof budgetInputSchema>;

export const budgetSchema = budgetInputSchema.extend({ updatedAt: z.string().datetime() });
export type Budget = z.infer<typeof budgetSchema>;

const windowLabels: Record<BudgetWindowKind, string> = { "five-hour": "5H", weekly: "WK", monthly: "MO" };
const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;

/** Format the time until a reset: "0h35" or "13h05" below one day, else whole days ("4d"). */
export function formatResetIn(resetsAt: string | undefined, now: number): string | undefined {
  if (!resetsAt) return undefined;
  const remaining = Date.parse(resetsAt) - now;
  if (!Number.isFinite(remaining) || remaining <= 0) return undefined;
  if (remaining < day) {
    const minutes = Math.floor(remaining / minute);
    return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;
  }
  return `${Math.floor(remaining / day)}d`;
}

/** Format a credit amount: "420", "17.4", "1.5K", "2M". */
export function formatCredits(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  if (value < 100 && !Number.isInteger(value)) return value.toFixed(1).replace(/\.0$/, "");
  return String(Math.round(value));
}

function windowCard(kind: BudgetWindowKind, budget: Budget | undefined, now: number): BudgetWindowCard {
  const window = budget?.windows.find((entry) => entry.kind === kind);
  const percent = window?.usedPercent ?? (kind === "monthly" && budget?.credits ? Math.min(100, (budget.credits.used / budget.credits.total) * 100) : undefined);
  const reset = formatResetIn(window?.resetsAt, now);
  // After its reset, a window starts again at 0%. The hub assumes no use since the last report: Codex writes a new snapshot each time it runs.
  if (window?.resetsAt && !reset) return { label: windowLabels[kind], percent: 0 };
  return { label: windowLabels[kind], ...(percent === undefined ? {} : { percent }), ...(reset ? { reset } : {}) };
}

function extraAmount(extra: NonNullable<Budget["extra"]>): string {
  const prefix = extra.currency === "usd" ? "$" : "";
  if (extra.kind === "extra") return `${prefix}${formatCredits(extra.used ?? 0)}${extra.limit === undefined ? "" : `/${formatCredits(extra.limit)}`}`;
  const balance = extra.balance === undefined ? "?" : formatCredits(extra.balance);
  return extra.currency === "credits" && !prefix ? `${balance} cr` : `+${prefix}${balance}`;
}

/** Make the data of a budget key. Claude and OpenAI have 5-hour and weekly windows. Copilot and JetBrains AI have one monthly window. */
export function budgetCardData(provider: BudgetProviderId, budget: Budget | undefined, now = Date.now()): BudgetCardData {
  const monthly = provider === "copilot" || provider === "jetbrains";
  const windows = monthly ? [windowCard("monthly", budget, now)] : [windowCard("five-hour", budget, now), windowCard("weekly", budget, now)];
  const credits = budget?.credits;
  const extra = budget?.extra?.active ? { kind: budget.extra.kind, amount: extraAmount(budget.extra) } : undefined;
  return {
    provider,
    windows,
    ...(budget?.plan ? { plan: budget.plan.toUpperCase().slice(0, 8) } : {}),
    ...(monthly && credits && windows[0].percent !== undefined ? { used: formatCredits(credits.used), total: formatCredits(credits.total) } : {}),
    ...(extra ? { extra } : {}),
  };
}
