import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { SessionStore } from "./store.js";
import type { ProcessInfo } from "./processes.js";

const execute = promisify(execFile);
const inspectionTimeoutMilliseconds = 4000;
const snapshotSchema = z.object({
  status: z.enum(["available", "permission-denied", "unavailable"]),
  sessions: z.array(z.object({
    sessionId: z.string().uuid().toLowerCase(),
    state: z.enum(["working", "waiting", "done", "unknown"]),
  })).max(100),
});
type Snapshot = z.infer<typeof snapshotSchema>;
type Inspector = (processIdentifier: number) => Promise<unknown>;

export const claudeDesktopInspectionScript = String.raw`
ObjC.import("AppKit");
ObjC.import("ApplicationServices");
function run(argv) {
  function snapshot(status, sessions) { return JSON.stringify({ status: status, sessions: sessions || [] }); }
  if (!$.AXIsProcessTrusted()) return snapshot("permission-denied");
  function attribute(element, name) {
    var output = Ref();
    var status = $.AXUIElementCopyAttributeValue(element, $(name), output);
    if (status === -25205 || status === -25212) return null;
    if (status !== 0) throw new Error("AX_READ_FAILED");
    return output[0];
  }
  function scalar(element, name) {
    var value = attribute(element, name);
    if (!value) return null;
    var object = ObjC.castRefToObject(value);
    if (name === "AXURL" && object.isKindOfClass($.NSURL)) return ObjC.unwrap(object.absoluteString);
    return ObjC.unwrap(object);
  }
  function children(element, name) {
    var value = attribute(element, name || "AXChildren");
    if (!value) return [];
    var array = ObjC.castRefToObject(value);
    var result = [];
    for (var index = 0; index < array.count; index++) result.push(array.objectAtIndex(index));
    return result;
  }
  try {
    var root = $.AXUIElementCreateApplication(Number(argv[0]));
    $.AXUIElementSetMessagingTimeout(root, 0.2);
    var pending = children(root, "AXWindows").map(function(window) { return { element: window, session: null }; });
    var count = 0;
    var sessions = [];
    while (pending.length && count++ < 6000) {
      var item = pending.pop();
      var element = item.element;
      var role = scalar(element, "AXRole");
      if (["AXStaticText", "AXMenu", "AXMenuBar", "AXImage"].indexOf(role) !== -1 || scalar(element, "AXHidden") === true) continue;
      var session = item.session;
      if (role === "AXWebArea") {
        var location = scalar(element, "AXURL");
        var match = typeof location === "string" && location.match(/^https:\/\/claude\.ai\/chat\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i);
        if (!match) continue;
        session = { sessionId: match[1], working: false, waiting: false, composer: false, send: false };
        sessions.push(session);
      }
      if (session && role === "AXButton") {
        var label = scalar(element, "AXTitle") || scalar(element, "AXDescription");
        var enabled = scalar(element, "AXEnabled") !== false;
        if (typeof label === "string") {
          if (enabled && /^(Stop|Stop response|Stop generating|Stop Claude)$/i.test(label)) session.working = true;
          if (enabled && /^(Allow once|Allow always|Approve|Approve once|Approve tool use)$/i.test(label)) session.waiting = true;
          if (/^(Send|Send message|Send prompt)$/i.test(label)) session.send = true;
        }
      }
      if (session && role === "AXTextArea" && scalar(element, "AXEnabled") !== false) session.composer = true;
      if (["AXTextArea", "AXTextField", "AXSecureTextField"].indexOf(role) !== -1) continue;
      var descendants = children(element);
      for (var index = 0; index < descendants.length; index++) pending.push({ element: descendants[index], session: session });
    }
    if (pending.length) return snapshot("unavailable");
    return snapshot("available", sessions.map(function(session) {
      return { sessionId: session.sessionId, state: session.waiting ? "waiting" : session.working ? "working" : session.composer && session.send ? "done" : "unknown" };
    }));
  } catch (error) { return snapshot("unavailable"); }
}`;

async function inspectDesktop(processIdentifier: number): Promise<unknown> {
  const result = await execute("/usr/bin/osascript", ["-l", "JavaScript", "-e", claudeDesktopInspectionScript, "--", String(processIdentifier)], {
    timeout: inspectionTimeoutMilliseconds,
    maxBuffer: 64 * 1024,
  });
  return JSON.parse(result.stdout);
}

export class ClaudeDesktopTracker {
  readonly #tracked = new Set<string>();
  readonly #signatures = new Map<string, string>();
  readonly #observations = new Map<string, { state: string; transitionAt: string }>();
  status: Snapshot["status"] = "unavailable";

  constructor(private readonly store: SessionStore, private readonly inspect: Inspector = inspectDesktop) {}

  get hasSessions(): boolean {
    return this.#tracked.size > 0 && this.status === "available";
  }

  async scan(processes: ProcessInfo[]): Promise<void> {
    const application = processes.find((candidate) => /\/Claude\.app\/Contents\/MacOS\/Claude$/.test(candidate.name));
    if (!application) {
      for (const identifier of this.#tracked) this.store.remove(identifier);
      this.#tracked.clear();
      this.#signatures.clear();
      this.#observations.clear();
      this.status = "unavailable";
      return;
    }
    const snapshot = snapshotSchema.parse(await this.inspect(application.pid));
    this.status = snapshot.status;
    if (snapshot.status !== "available") {
      this.unavailable(snapshot.status === "permission-denied" ? "ACCESSIBILITY_DENIED" : "ACCESSIBILITY_UNAVAILABLE");
      return;
    }
    const observed = new Map<string, Snapshot["sessions"][number]>();
    for (const session of snapshot.sessions) {
      const previous = observed.get(session.sessionId);
      observed.set(session.sessionId, previous && previous.state !== session.state ? { ...session, state: "unknown" } : session);
    }
    const present = new Set<string>();
    for (const session of observed.values()) {
      const identifier = `claude-chat:${session.sessionId}`;
      present.add(identifier);
      const signature = JSON.stringify([session, application.pid, application.startedAt]);
      if (this.#signatures.get(identifier) === signature) continue;
      const observedAt = new Date().toISOString();
      const previous = this.store.get(identifier);
      const known = this.#observations.get(identifier) ?? (previous && previous.state !== "unknown"
        ? { state: previous.state, transitionAt: previous.stateChangedAt ?? previous.lastActivityAt } : undefined);
      const transitionAt = known?.state === session.state ? known.transitionAt : observedAt;
      if (session.state !== "unknown") this.#observations.set(identifier, { state: session.state, transitionAt });
      this.store.upsert({
        id: identifier,
        source: "claude-desktop",
        harness: "claude-app",
        label: `Claude chat · ${session.sessionId.slice(-6)}`,
        state: session.state,
        ended: false,
        focusTarget: {
          appName: "Claude",
          bundleId: "com.anthropic.claudefordesktop",
          pid: application.pid,
          claudeConversationId: session.sessionId,
        },
        metadata: {
          sessionId: session.sessionId,
          host: "Claude",
          ownerPid: String(application.pid),
          tracking: "claude-accessibility",
          stateEvent: `desktop.${session.state}`,
          telemetryStatus: session.state === "unknown" ? "unrecognized" : "available",
          telemetryLocation: "Claude desktop Accessibility controls",
          lastTelemetryAt: observedAt,
          hostLifetime: "open",
          hostEvidence: "Exposed Claude chat with a conversation URL",
        },
      }, observedAt, transitionAt);
      this.#signatures.set(identifier, signature);
      this.#tracked.add(identifier);
    }
    for (const identifier of this.#tracked) {
      if (present.has(identifier)) continue;
      this.store.remove(identifier);
      this.#tracked.delete(identifier);
      this.#signatures.delete(identifier);
      this.#observations.delete(identifier);
    }
  }

  unavailable(errorCode = "ACCESSIBILITY_UNAVAILABLE"): void {
    this.status = errorCode === "ACCESSIBILITY_DENIED" ? "permission-denied" : "unavailable";
    for (const identifier of this.#tracked) {
      const session = this.store.get(identifier);
      if (session && session.state !== "unknown") {
        this.store.upsert({ ...session, state: "unknown", metadata: { ...session.metadata, stateEvent: "desktop.unavailable", telemetryStatus: "unreadable", telemetryError: errorCode } }, session.lastActivityAt, new Date().toISOString());
      }
      this.#signatures.delete(identifier);
    }
  }
}
