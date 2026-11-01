import type { BudgetInput } from "../shared/budget.js";

/** The two limit bars on the Usage page of the Claude desktop app (Settings, Usage). */
export interface ClaudeUsageReading {
  session?: { percent: number; reset?: string };
  week?: { percent: number; reset?: string };
}

const weekdays = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const minute = 60_000;

/**
 * Change a reset text of the Usage page to a time. The page uses local time, for example
 * "Resets Mon 12:50 AM", "Resets Sunday 5:00 PM", "Resets 5:00 PM", "Resets tomorrow 9 AM", or "Resets in 2 hr 10 min".
 * Returns undefined for a text in another form. The page is in English only.
 */
export function parseClaudeReset(text: string | undefined, now: number): string | undefined {
  if (!text) return undefined;
  const value = text.trim().replace(/\s+/g, " ");
  const relative = value.match(/^Resets in (?:(\d+) ?(?:hr|hrs|hour|hours|h))?\s*(?:(\d+) ?(?:min|mins|minutes|m))?$/i);
  if (relative && (relative[1] || relative[2])) return new Date(now + (Number(relative[1] ?? 0) * 60 + Number(relative[2] ?? 0)) * minute).toISOString();
  const clock = value.match(/^Resets (?:(today|tomorrow|[a-z]{3,9})\.? )?(?:at )?(\d{1,2})(?::(\d{2}))? ?(AM|PM)$/i);
  if (!clock) return undefined;
  const [, dayWord, hourText, minuteText, meridiem] = clock;
  const hour = (Number(hourText) % 12) + (meridiem.toUpperCase() === "PM" ? 12 : 0);
  const minutes = Number(minuteText ?? 0);
  if (Number(hourText) < 1 || Number(hourText) > 12 || minutes > 59) return undefined;
  const target = new Date(now);
  target.setHours(hour, minutes, 0, 0);
  const day = dayWord?.toLowerCase();
  if (day === "tomorrow") target.setDate(target.getDate() + 1);
  else if (day && day !== "today") {
    const weekday = weekdays.indexOf(day.slice(0, 3));
    if (weekday < 0) return undefined;
    target.setDate(target.getDate() + ((weekday - target.getDay() + 7) % 7));
    if (target.getTime() <= now) target.setDate(target.getDate() + 7);
  } else if (!day && target.getTime() <= now) target.setDate(target.getDate() + 1);
  return target.toISOString();
}

/** Make the Claude budget from the Usage page. The page does not show the plan, so the caller gives the known plan. */
export function claudeUsageBudget(reading: ClaudeUsageReading, plan: string | undefined, now: number): BudgetInput | undefined {
  const window = (kind: "five-hour" | "weekly", value: ClaudeUsageReading["session"]) => {
    if (!value) return [];
    const resetsAt = parseClaudeReset(value.reset, now);
    return [{ kind, usedPercent: Math.min(100, Math.max(0, value.percent)), ...(resetsAt ? { resetsAt } : {}) }];
  };
  const windows = [...window("five-hour", reading.session), ...window("weekly", reading.week)];
  if (!windows.length) return undefined;
  return { provider: "claude", source: "claude-desktop-usage", ...(plan ? { plan } : {}), windows };
}
