// Types for claude-statusline.mjs. The script stays JavaScript, so that users can run it with Node.js and no build.

/** One limit window that the status line reports to the hub. */
export interface StatusLineBudgetWindow {
  kind: "five-hour" | "weekly";
  usedPercent?: number;
  resetsAt?: string;
}

/** The budget that the status line sends to `PUT /api/budgets/claude`. */
export interface StatusLineBudget {
  provider: "claude";
  source: "claude-statusline";
  plan?: string;
  windows: StatusLineBudgetWindow[];
}

/** Claude Code gives the status line command this JSON. Each field can be missing. */
export type StatusLineInput = unknown;

export function budgetFromStatusLine(input: StatusLineInput, plan?: string): StatusLineBudget | undefined;

export function statusText(input: StatusLineInput): string;
