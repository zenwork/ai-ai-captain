import { describe, expect, it } from "vitest";
import { sessionSchema, sessionStates } from "../src/shared/session.js";
import { cardIdentities } from "../src/shared/card-design.js";
import { sessionType } from "../streamdeck/src/cards.js";
import { demoKeyCount, demoSessions, demoStateSequence } from "./demo-keys-plan.js";

function toSession(input: ReturnType<typeof demoSessions>[number]) {
  const now = new Date().toISOString();
  return sessionSchema.parse({ ...input, createdAt: now, updatedAt: now, lastActivityAt: now });
}

describe("demo key plan", () => {
  it("makes 24 valid sessions with unique identifiers", () => {
    const sessions = demoSessions(0);

    expect(sessions).toHaveLength(demoKeyCount);
    expect(new Set(sessions.map((session) => session.id)).size).toBe(demoKeyCount);
  });

  it("covers each key identity in the plugin", () => {
    const identities = new Set(demoSessions(0).map((session) => sessionType(toSession(session))));

    expect(identities).toEqual(new Set(cardIdentities.map((identity) => identity.id)));
  });

  it("shows each key identity in the order of the design", () => {
    const identities = demoSessions(0).slice(0, cardIdentities.length).map((session) => sessionType(toSession(session)));

    expect(identities).toEqual(cardIdentities.map((identity) => identity.id));
  });

  it("goes through every session state in the sequence", () => {
    const states = new Set(demoStateSequence.flatMap((_state, step) => demoSessions(step).map((session) => session.state)));

    expect(states).toEqual(new Set(sessionStates));
  });

  it("keeps finished sessions in the hub", () => {
    const finished = demoSessions(3).filter((session) => session.state === "done" || session.state === "failed");

    expect(finished.length).toBeGreaterThan(0);
    expect(finished.every((session) => session.ended === false)).toBe(true);
  });
});
