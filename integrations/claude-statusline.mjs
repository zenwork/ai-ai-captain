#!/usr/bin/env node
// Claude Code status line that reports the Claude subscription limits to the AI AI Captain hub.
// Claude Code gives the status line command JSON on stdin. For Pro and Max plans, it includes
// rate_limits.five_hour and rate_limits.seven_day with used_percentage (0-100) and resets_at (Unix seconds).
// The script sends only these numbers and the plan name to the hub. It never sends prompts, paths, or tokens.
//
// Usage in ~/.claude/settings.json:
//   "statusLine": { "type": "command", "command": "node /path/to/ai-ai-captain/integrations/claude-statusline.mjs --plan max" }
import { pathToFileURL } from "node:url";

const hubUrl = process.env.AI_AI_CAPTAIN_URL ?? "http://127.0.0.1:43681";
const reportTimeoutMilliseconds = 1500;

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function window(kind, value) {
  if (!value || typeof value !== "object") return { kind, usedPercent: 0 };
  const percent = Number(value.used_percentage);
  const reset = Number(value.resets_at);
  return {
    kind,
    ...(Number.isFinite(percent) ? { usedPercent: Math.min(100, Math.max(0, percent)) } : {}),
    ...(Number.isFinite(reset) && reset > 0 ? { resetsAt: new Date(reset * 1000).toISOString() } : {}),
  };
}

/**
 * Make the budget from the status line input. Returns undefined before the first API response of the session,
 * when Claude Code has no rate limits yet. Claude Code drops a window after its reset time. Then the window is at 0%.
 */
export function budgetFromStatusLine(input, plan) {
  const limits = input && typeof input === "object" ? input.rate_limits : undefined;
  if (!limits || typeof limits !== "object" || (!limits.five_hour && !limits.seven_day)) return undefined;
  return {
    provider: "claude",
    source: "claude-statusline",
    ...(plan && /^[\w .+-]{1,24}$/.test(plan) ? { plan } : {}),
    windows: [window("five-hour", limits.five_hour), window("weekly", limits.seven_day)],
  };
}

/** A short status line: the model, the context use, and the two limit windows. */
export function statusText(input) {
  const parts = [];
  if (input?.model?.display_name) parts.push(String(input.model.display_name));
  const context = Number(input?.context_window?.used_percentage);
  if (Number.isFinite(context)) parts.push(`ctx ${Math.round(context)}%`);
  const five = Number(input?.rate_limits?.five_hour?.used_percentage);
  const week = Number(input?.rate_limits?.seven_day?.used_percentage);
  if (Number.isFinite(five)) parts.push(`5h ${Math.round(five)}%`);
  if (Number.isFinite(week)) parts.push(`wk ${Math.round(week)}%`);
  return parts.join(" · ");
}

async function main() {
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  let input = {};
  try { input = JSON.parse(text); } catch { /* Claude Code always sends JSON. Show an empty line if it does not. */ }
  const budget = budgetFromStatusLine(input, option("--plan"));
  if (budget) {
    // The hub can be stopped. The status line must not fail or wait for it.
    await fetch(`${hubUrl}/api/budgets/claude`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(budget),
      signal: AbortSignal.timeout(reportTimeoutMilliseconds),
    }).catch(() => undefined);
  }
  if (!process.argv.includes("--quiet")) process.stdout.write(`${statusText(input)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
