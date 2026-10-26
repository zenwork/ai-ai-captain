import { describe, expect, it } from "vitest";
import { explainSessionState } from "./diagnostics.js";
import { sessionDetails } from "../../web-src/session-details.js";
import type { Session } from "./session.js";

const session: Session = {
  id: "codex:thread", source: "codex-local", harness: "codex-ide", label: "Codex", state: "unknown", ended: false,
  createdAt: "2026-10-25T12:00:00.000Z", updatedAt: "2026-10-25T12:00:00.000Z", lastActivityAt: "2026-10-25T12:00:00.000Z",
  metadata: { tracking: "codex-events", stateEvent: "events.unavailable", ownerPid: "123", host: "IntelliJ IDEA", telemetryStatus: "missing", telemetryLocation: "/home/example/.codex/sessions" },
};

describe("session state diagnostics", () => {
  it("explains Claude registration and desktop Accessibility failures", () => {
    const registry = explainSessionState({ ...session, metadata: { tracking: "claude-registry" } });
    expect(registry.summary).toContain("live Claude registration");
    expect(registry.nextStep).toContain("does not change Claude settings");
    const desktop = explainSessionState({ ...session, metadata: { tracking: "claude-accessibility" } });
    expect(desktop.summary).toContain("exposed Claude chat");
    expect(desktop.nextStep).toContain("Accessibility");
  });
  it("explains missing Codex telemetry without inventing a running state or a disabled setting", () => {
    const explanation = explainSessionState(session);
    expect(explanation.summary).toContain("event file could not be found");
    expect(explanation.summary).toContain("does not tell us");
    expect(explanation.nextStep).toContain("lifecycle reporter");
    expect(explanation.nextStep).toContain("has not changed");
  });

  it.each([
    ["unreadable", "could not read"],
    ["unrecognized", "no supported lifecycle event"],
    ["discovery-unavailable", "could not inspect live processes"],
  ])("distinguishes %s from missing telemetry", (status, explanation) => {
    expect(explainSessionState({ ...session, metadata: { ...session.metadata, telemetryStatus: status } }).summary).toContain(explanation);
  });

  it("explains reported states and distinguishes open completion from actual closure", () => {
    expect(explainSessionState({ ...session, state: "waiting" }).summary).toContain("user action");
    expect(explainSessionState({ ...session, state: "working" }).summary).toContain("in progress");
    expect(explainSessionState({ ...session, state: "done" }).summary).toContain("still open");
    expect(explainSessionState({ ...session, state: "done", ended: true }).summary).toContain("has closed");
    expect(explainSessionState({ ...session, state: "failed" }).nextStep).toContain("original error");
    expect(explainSessionState({ ...session, state: "starting" }).summary).toContain("started or resumed");
    expect(explainSessionState({ ...session, metadata: undefined }).summary).toContain("No supported lifecycle signal");
  });

  it("shows evidence and troubleshooting for unknown sessions without pretending report time is observed activity", () => {
    const html = sessionDetails(session);
    expect(html).toContain('data-details-id="codex:thread" open');
    expect(html).toContain("event file could not be found");
    expect(html).toContain("State event");
    expect(html).toContain("events.unavailable");
    expect(html).toContain("/home/example/.codex/sessions");
    expect(html).toContain("Session runtime PID");
    expect(html).toContain("<dd>123</dd>");
    expect(html).toContain("<dt>Last observed event</dt><dd>Not observed</dd>");
    expect(html).toContain("<dt>Model</dt><dd>Not observed</dd>");
    expect(sessionDetails(session, false)).not.toContain('data-details-id="codex:thread" open');
    expect(sessionDetails({ ...session, state: "done" })).not.toContain('data-details-id="codex:thread" open');
  });

  it("escapes diagnostic fields and only renders whitelisted metadata, not transcripts or arbitrary fields", () => {
    const malicious = '<script>alert("private")</script>';
    const html = sessionDetails({ ...session, id: malicious, project: malicious, metadata: { ...session.metadata, telemetryLocation: malicious, telemetryError: "EACCES", prompt: "secret prompt", transcript: "secret transcript" } });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("EACCES");
    expect(html).not.toMatch(/secret prompt|secret transcript/);
  });
});
