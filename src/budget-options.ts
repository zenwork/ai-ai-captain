import { budgetInputSchema, type BudgetInput } from "./shared/budget.js";

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function number(args: string[], name: string): number | undefined {
  const value = option(args, name);
  return value === undefined ? undefined : Number(value);
}

/** A reset time is an ISO time, or a time from now such as "90m", "5h", or "4d". */
function resetTime(value: string | undefined, now: number): string | undefined {
  if (value === undefined) return undefined;
  const relative = /^(\d+(?:\.\d+)?)(m|h|d)$/.exec(value);
  if (!relative) return new Date(value).toISOString();
  const unit = { m: 60_000, h: 3_600_000, d: 86_400_000 }[relative[2] as "m" | "h" | "d"];
  return new Date(now + Number(relative[1]) * unit).toISOString();
}

/** Make a budget from the options of the "report budget" command. */
export function budgetFromOptions(provider: string, args: string[], now = Date.now()): BudgetInput {
  const windows = (["five-hour", "weekly", "monthly"] as const).flatMap((kind) => {
    const usedPercent = number(args, `--${kind}-percent`);
    const resetsAt = resetTime(option(args, `--${kind}-reset`), now);
    return usedPercent === undefined && resetsAt === undefined
      ? []
      : [{ kind, ...(usedPercent === undefined ? {} : { usedPercent }), ...(resetsAt ? { resetsAt } : {}) }];
  });
  const creditsUsed = number(args, "--credits-used");
  const creditsTotal = number(args, "--credits-total");
  const extraUsed = number(args, "--extra-used");
  const topUp = number(args, "--top-up");
  const active = args.includes("--extra-active");
  return budgetInputSchema.parse({
    provider,
    source: option(args, "--source") ?? "cli",
    plan: option(args, "--plan"),
    windows,
    ...(creditsUsed !== undefined && creditsTotal !== undefined ? { credits: { used: creditsUsed, total: creditsTotal } } : {}),
    ...(extraUsed !== undefined
      ? {
          extra: {
            kind: "extra",
            active: active || extraUsed > 0,
            used: extraUsed,
            limit: number(args, "--extra-limit"),
            currency: args.includes("--extra-usd") ? "usd" : "credits",
          },
        }
      : {}),
    ...(extraUsed === undefined && topUp !== undefined ? { extra: { kind: "topup", active, balance: topUp, currency: "credits" } } : {}),
  });
}
