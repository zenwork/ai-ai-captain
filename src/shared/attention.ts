import type { Session } from "./session.js";

export const doneAttentionLifetimeMs = 10 * 60 * 1000;
const flashDurationMs = 250;
const stages = [
  { until: 10_000, period: 500 },
  { until: 30_000, period: 1000 },
  { until: 60_000, period: 2000 },
  { until: 120_000, period: 5000 },
  { until: 300_000, period: 10_000 },
  { until: doneAttentionLifetimeMs, period: 30_000 },
];

export interface DoneAttention {
  phase: "bright" | "dim" | "aged";
  nextChangeAt?: number;
}

export function doneAttention(session: Session, now = Date.now(), reducedMotion = false): DoneAttention | undefined {
  if (session.state !== "done") return undefined;
  const completedAt = Date.parse(session.stateChangedAt ?? session.lastActivityAt);
  if (!Number.isFinite(completedAt) || completedAt > now) return { phase: "aged" };
  const age = now - completedAt;
  if (age >= doneAttentionLifetimeMs) return { phase: "aged" };
  if (reducedMotion) return { phase: "bright", nextChangeAt: completedAt + doneAttentionLifetimeMs };
  let stageStart = 0;
  for (const stage of stages) {
    if (age < stage.until) {
      const position = (age - stageStart) % stage.period;
      const bright = position < flashDurationMs;
      const nextPhase = age + (bright ? flashDurationMs - position : stage.period - position);
      return { phase: bright ? "bright" : "dim", nextChangeAt: completedAt + Math.min(nextPhase, stage.until) };
    }
    stageStart = stage.until;
  }
  return { phase: "aged" };
}
