import { describe, expect, it } from "vitest";
import { sessionSchema, sessionStates } from "../src/shared/session.js";
import { cardIdentities } from "../src/shared/card-design.js";
import { sessionType } from "../streamdeck/src/cards.js";
import { allDemoSessionIdentifiers, demoBrightnessKeyCount, demoBrightnessSessions, demoFlashIntensityLevels, demoKeyCount, demoSessions, demoStateSequence } from "./demo-keys-plan.js";

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

  it("shows WAITING and DONE keys for each flash intensity", () => {
    const sessions = demoBrightnessSessions();

    expect(sessions).toHaveLength(demoBrightnessKeyCount);
    expect(new Set(sessions.map((session) => session.id)).size).toBe(demoBrightnessKeyCount);
    expect(sessions.slice(0, 5).map((session) => session.state)).toEqual(Array(5).fill("waiting"));
    expect(sessions.slice(5).map((session) => session.state)).toEqual(Array(5).fill("done"));
    expect(sessions.map((session) => session.metadata?.flashIntensity)).toEqual([...demoFlashIntensityLevels, ...demoFlashIntensityLevels].map(String));
    expect(sessions.every((session) => session.ended === false)).toBe(true);
    for (const session of sessions) expect(toSession(session).metadata?.flashIntensity).toMatch(/^[0-4]$/);
  });

  it("lists every demo session identifier for cleanup", () => {
    const identifiers = allDemoSessionIdentifiers();

    expect(identifiers).toHaveLength(demoKeyCount + demoBrightnessKeyCount);
    expect(new Set(identifiers).size).toBe(demoKeyCount + demoBrightnessKeyCount);
  });
});
