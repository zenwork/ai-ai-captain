import { describe, expect, it } from "vitest";
import { hookEndsSession, hookSessionId, stateForHook } from "./hooks.js";

describe("session hook normalization", () => {
  it("keeps lifecycle events on the same session rather than using each event's ID", () => {
    expect(hookSessionId({ session_id: "conversation", id: "first-event" })).toBe(hookSessionId({ session_id: "conversation", id: "second-event" }));
    expect(() => hookSessionId({ id: "event-only" })).toThrow("no session identifier");
    expect(hookSessionId({}, "explicit-session")).toBe("explicit-session");
  });

  it("distinguishes a starting session, an active turn, waiting for input, and closure", () => {
    expect(stateForHook("sessionStart")).toBe("starting");
    expect(stateForHook("userPromptSubmitted")).toBe("working");
    expect(stateForHook("postToolUse")).toBe("working");
    expect(stateForHook("PostToolUseFailure")).toBe("working");
    expect(stateForHook("permission.requested")).toBe("waiting");
    expect(stateForHook("permission.completed")).toBe("working");
    expect(stateForHook("agentStop")).toBe("done");
    expect(stateForHook("agent-turn-complete")).toBe("done");
    expect(stateForHook("session.idle")).toBe("done");
    expect(stateForHook("input-required")).toBe("waiting");
    expect(stateForHook("Notification", { notification_type: "permission_prompt" })).toBe("waiting");
    expect(stateForHook("Notification", { notification_type: "idle_prompt" })).toBe("done");
    expect(stateForHook("Notification")).toBe("unknown");
    expect(stateForHook("sessionEnd")).toBe("done");
    expect(stateForHook("session.error")).toBe("failed");
    expect(stateForHook("unexpectedEvent")).toBe("unknown");
    expect(hookEndsSession("agentStop")).toBe(false);
    expect(hookEndsSession("agent-turn-complete")).toBe(false);
    expect(hookEndsSession("sessionEnd")).toBe(true);
  });
});
