import { z } from "zod";
import type { HubSettings } from "./settings.js";

export const sessionStates = ["starting", "working", "waiting", "done", "failed", "unknown"] as const;
export type SessionState = (typeof sessionStates)[number];

export const focusTargetSchema = z.object({
  appName: z.string().trim().min(1).max(120).optional(),
  appPath: z.string().trim().max(1024).refine((value) => value.startsWith("/") && value.endsWith(".app"), "Application paths must be absolute macOS .app bundle paths").optional(),
  bundleId: z.string().trim().min(1).max(200).optional(),
  pid: z.number().int().positive().optional(),
  claudeConversationId: z.string().uuid().optional(),
  url: z.string().url().refine((value) => value.startsWith("http://") || value.startsWith("https://"), "Focus URLs must use HTTP or HTTPS").optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one focus target is required");
export type FocusTarget = z.infer<typeof focusTargetSchema>;

export const sessionInputSchema = z.object({
  id: z.string().trim().min(1).max(200),
  source: z.string().trim().min(1).max(80),
  harness: z.string().trim().min(1).max(80).optional(),
  model: z.string().trim().max(120).optional(),
  label: z.string().trim().min(1).max(160),
  state: z.enum(sessionStates),
  ended: z.boolean().optional(),
  focusTarget: focusTargetSchema.optional(),
  project: z.string().trim().max(240).optional(),
  metadata: z.record(z.string(), z.string().max(240)).optional(),
});

export const sessionSchema = sessionInputSchema.extend({
  stateChangedAt: z.string().datetime().optional(),
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
  | { type: "snapshot"; sessions: Session[]; clients?: Client[]; settings?: HubSettings }
  | { type: "settings"; settings: HubSettings }
  | { type: "clients"; clients: Client[] }
  | { type: "upsert"; session: Session }
  | { type: "remove"; id: string };
