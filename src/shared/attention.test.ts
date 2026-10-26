import { describe, expect, it } from "vitest";
import { doneAttention, doneAttentionLifetimeMs } from "./attention.js";
import type { Session } from "./session.js";

const completedAt = Date.parse("2026-10-25T12:00:00.000Z");
const session: Session = {
  id: "completed", source: "test", label: "Task", state: "done", ended: false,
  createdAt: new Date(completedAt - 60_000).toISOString(), updatedAt: new Date(completedAt).toISOString(), lastActivityAt: new Date(completedAt).toISOString(), stateChangedAt: new Date(completedAt).toISOString(),
};

describe("completion attention", () => {
  it.each([
    [0, 500], [10_000, 1000], [30_000, 2000], [60_000, 5000], [120_000, 10_000], [300_000, 30_000],
  ])("flashes briefly with a %i-ms stage offset and a %i-ms period", (stageStart, period) => {
    expect(doneAttention(session, completedAt + stageStart)).toEqual({ phase: "bright", nextChangeAt: completedAt + stageStart + 250 });
    expect(doneAttention(session, completedAt + stageStart + 250)).toEqual({ phase: "dim", nextChangeAt: completedAt + stageStart + period });
    expect(doneAttention(session, completedAt + stageStart + period)?.phase).toBe("bright");
  });

  it("switches to steady darker blue at ten minutes with no further animation", () => {
    expect(doneAttentionLifetimeMs).toBe(600_000);
    expect(doneAttention(session, completedAt + 599_999)).toEqual({ phase: "dim", nextChangeAt: completedAt + 600_000 });
    expect(doneAttention(session, completedAt + 600_000)).toEqual({ phase: "aged" });
    expect(doneAttention(session, completedAt + 3_600_000)).toEqual({ phase: "aged" });
  });

  it("uses the actual state transition rather than refreshed activity or update timestamps", () => {
    const refreshed = { ...session, updatedAt: new Date(completedAt + 900_000).toISOString(), lastActivityAt: new Date(completedAt + 900_000).toISOString() };
    expect(doneAttention(refreshed, completedAt + 900_000)).toEqual({ phase: "aged" });
    expect(doneAttention({ ...session, stateChangedAt: undefined }, completedAt + 600_000)).toEqual({ phase: "aged" });
  });

  it("respects reduced motion while still aging to darker blue on time", () => {
    expect(doneAttention(session, completedAt + 300, true)).toEqual({ phase: "bright", nextChangeAt: completedAt + 600_000 });
    expect(doneAttention(session, completedAt + 600_000, true)).toEqual({ phase: "aged" });
  });

  it("does not animate non-done states or invent fresh alerts for invalid timestamps", () => {
    for (const state of ["working", "waiting", "starting", "failed", "unknown"] as const) expect(doneAttention({ ...session, state }, completedAt)).toBeUndefined();
    expect(doneAttention({ ...session, stateChangedAt: "invalid" }, completedAt)).toEqual({ phase: "aged" });
    expect(doneAttention(session, completedAt - 1000)).toEqual({ phase: "aged" });
  });
});
