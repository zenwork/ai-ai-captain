import { z } from "zod";
import type { HubSettings } from "./settings.js";
import type { Budget } from "./budget.js";

export const sessionStates = ["starting", "working", "waiting", "done", "failed", "unknown"] as const;
export type SessionState = (typeof sessionStates)[number];
// The user can hide a session in these states from the Stream Deck. Active sessions (starting, working, waiting) stay visible.
export const dismissableStates: readonly SessionState[] = ["done", "failed", "unknown"];

export const focusTargetSchema = z.object({
  appName: z.string().trim().min(1).max(120).optional(),
  appPath: z.string().trim().max(1024).refine((value) => value.startsWith("/") && value.endsWith(".app"), "Application paths must be absolute macOS .app bundle paths").optional(),
  bundleId: z.string().trim().min(1).max(200).optional(),
  pid: z.number().int().positive().optional(),
  claudeConversationId: z.string().uuid().optional(),
  // The title key of a Claude desktop sidebar row. Focus presses that row through macOS Accessibility.
  claudeRowKey: z.string().regex(/^[0-9a-f]{16}(?:-\d{1,2})?$/).optional(),
  url: z.string().url().refine((value) => value.startsWith("http://") || value.startsWith("https://"), "Focus URLs must use HTTP or HTTPS").optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one focus target is required");
export type FocusTarget = z.infer<typeof focusTargetSchema>;

export const sessionFreedoms = ["limited", "full"] as const;
export type SessionFreedom = (typeof sessionFreedoms)[number];
export const sessionApprovals = ["asks", "never"] as const;
export type SessionApproval = (typeof sessionApprovals)[number];

export const sessionInputSchema = z.object({
  id: z.string().trim().min(1).max(200),
  source: z.string().trim().min(1).max(80),
  harness: z.string().trim().min(1).max(80).optional(),
  model: z.string().trim().max(120).optional(),
  tokensUsed: z.number().int().nonnegative().optional(),
  contextUsedPercent: z.number().min(0).max(100).optional(),
  freedom: z.enum(sessionFreedoms).optional(),
  approval: z.enum(sessionApprovals).optional(),
  label: z.string().trim().min(1).max(160),
  state: z.enum(sessionStates),
  ended: z.boolean().optional(),
  focusTarget: focusTargetSchema.optional(),
  project: z.string().trim().max(240).optional(),
  metadata: z.record(z.string(), z.string().max(240)).optional(),
});

export const sessionSchema = sessionInputSchema.extend({
  stateChangedAt: z.string().datetime().optional(),
  // The user hid this session on the Stream Deck. The hub clears it when the state or the state change time changes.
  dismissedAt: z.string().datetime().optional(),
  // The user pressed this DONE session on the Stream Deck. The key shows assessed DONE. The hub clears it when the state or the state change time changes.
  attendedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastActivityAt: z.string().datetime(),
});

export type SessionInput = z.infer<typeof sessionInputSchema>;
export type Session = z.infer<typeof sessionSchema>;

export interface Client {
  id: string;
  name: string;
  focusTarget: FocusTarget;
  sessionTracking: "unavailable";
  trackingDetails?: string;
}

export type HubEvent =
  | { type: "snapshot"; sessions: Session[]; clients?: Client[]; settings?: HubSettings; budgets?: Budget[] }
  | { type: "budgets"; budgets: Budget[] }
  | { type: "settings"; settings: HubSettings }
  | { type: "clients"; clients: Client[] }
  | { type: "upsert"; session: Session }
  | { type: "remove"; id: string };
