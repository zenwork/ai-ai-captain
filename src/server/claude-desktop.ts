import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { SessionStore } from "./store.js";
import type { ProcessInfo } from "./processes.js";
import type { BudgetStore } from "./budgets.js";
import { claudeUsageBudget } from "./claude-usage.js";

const execute = promisify(execFile);
const inspectionTimeoutMilliseconds = 4000;
const sessionStateSchema = z.enum(["working", "waiting", "done", "failed", "unknown"]);
// A title key is a hash that the inspection script makes from a sidebar or page title. The title does not leave the script.
const titleKeySchema = z.string().regex(/^[0-9a-f]{16}(?:-\d{1,2})?$/);
// The label of the model picker in the open page, for example "Opus 5.5 Medium".
const modelLabelSchema = z.string().trim().min(1).max(120);
const chatSessionSchema = z.object({
  kind: z.literal("chat").default("chat"),
  sessionId: z.uuid().toLowerCase(),
  titleKey: titleKeySchema.optional(),
  model: modelLabelSchema.optional(),
  state: sessionStateSchema,
});
// Cowork tasks use claude.ai/cowork/cse_<ID> URLs. Claude Code tasks use claude.ai/code/session_<ID> URLs.
const taskSessionSchema = z.object({
  kind: z.literal("task"),
  sessionId: z.string().regex(/^(?:cse|session)_[0-9A-Za-z]{20,40}$/),
  titleKey: titleKeySchema.optional(),
  model: modelLabelSchema.optional(),
  state: sessionStateSchema,
});
// A sidebar row is a chat or a task in the "Chats and tasks" list. Idle rows are not reported.
const rowSessionSchema = z.object({
  kind: z.literal("row"),
  sessionId: titleKeySchema,
  state: sessionStateSchema,
  // The app shows the row as read ("Done", "Completed"), not "Unread response". The user has opened the result.
  seen: z.literal(true).optional(),
});
const usageMeterSchema = z.object({ percent: z.number().min(0).max(100), reset: z.string().max(60).optional() });
const snapshotSchema = z.object({
  usage: z.object({ session: usageMeterSchema.optional(), week: usageMeterSchema.optional() }).optional(),
  // "partial": the inspection reached its element limit. The sessions that it found are correct, but others can be missing.
  status: z.enum(["available", "partial", "permission-denied", "unavailable"]),
  sessions: z.array(z.union([rowSessionSchema, taskSessionSchema, chatSessionSchema])).max(200),
});
type Snapshot = z.infer<typeof snapshotSchema>;
type ObservedSession = Snapshot["sessions"][number] & { conversationId?: string; model?: string };

/** Change a model picker label such as "Opus 5.5 Medium" to a model name such as "claude-opus-5-5". The effort level is not kept. */
export function claudeModelName(label: string): string {
  const match = /^(opus|sonnet|haiku|fable)\s+(\d+(?:\.\d+)?)\b/i.exec(label);
  return match ? `claude-${match[1].toLowerCase()}-${match[2].replace(".", "-")}` : label;
}
type Inspector = (processIdentifier: number) => Promise<unknown>;

/**
 * Inspect the Claude desktop app. With a second argument (a row title key), the script brings the app to the front,
 * clicks that sidebar row, and prints "open" or "clicked". It throws when the row does not open.
 */
export const claudeDesktopInspectionScript = String.raw`
ObjC.import("AppKit");
ObjC.import("ApplicationServices");
ObjC.import("CoreGraphics");
function run(argv) {
  var pressKey = argv.length > 1 ? String(argv[1]) : null;
  function snapshot(status, sessions, usage) {
    if (pressKey) throw new Error("ROW_NOT_PRESSED");
    var result = { status: status, sessions: sessions || [] };
    if (usage && (usage.session || usage.week)) result.usage = usage;
    return JSON.stringify(result);
  }
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
  function hex(value) { return ("0000000" + (value >>> 0).toString(16)).slice(-8); }
  // Two FNV-1a variants give a 64-bit key. Only the key leaves the script.
  function titleKey(text) {
    var first = 0x811c9dc5, second = 0x050c5d1f;
    for (var index = 0; index < text.length; index++) {
      var code = text.charCodeAt(index);
      first = Math.imul(first ^ code, 16777619);
      second = Math.imul(second ^ code, 2246822507);
    }
    return hex(first) + hex(second);
  }
  var rowStates = {
    "Running": "working", "Awaiting input": "waiting", "Awaiting answer": "waiting", "Unread response": "done",
    "Done": "done", "Completed": "done", "Error": "failed", "Idle": "idle", "Archived": "idle",
  };
  var seenLabels = { "Done": true, "Completed": true };
  var count = 0;
  var pause = typeof delay === "function" ? delay : function() {};
  // Find the title key of the open claude.ai page. Return null when no page is open.
  function openPageKey(root) {
    var pending = children(root, "AXWindows");
    var visited = 0;
    while (pending.length && visited++ < 400) {
      var element = pending.shift();
      var role = scalar(element, "AXRole");
      if (role === "AXWebArea") {
        var location = scalar(element, "AXURL");
        var title = scalar(element, "AXTitle");
        if (typeof location === "string" && /^https:\/\/claude\.ai\//.test(location) && typeof title === "string" && / - Claude$/.test(title)) return titleKey(title.replace(/ - Claude$/, ""));
        if (typeof location === "string" && /^https:\/\/claude\.ai\//.test(location)) return null;
        continue;
      }
      if (["AXStaticText", "AXTextArea", "AXTextField", "AXImage", "AXButton"].indexOf(role) !== -1) continue;
      children(element).forEach(function(child) { pending.push(child); });
    }
    return null;
  }
  function opened(root, key, attempts) {
    for (var attempt = 0; attempt < attempts; attempt++) {
      if (openPageKey(root) === key.replace(/-\d+$/, "")) return true;
      pause(0.15);
    }
    return false;
  }
  // Read an AXValue point or size from its description, for example "x:10.0 y:20.0" or "w:10.0 h:20.0".
  function numbers(element, name, first, second) {
    var value = attribute(element, name);
    if (!value) return null;
    var text = ObjC.unwrap(ObjC.castRefToObject(value).description);
    var match = typeof text === "string" && text.match(new RegExp(first + ":(-?[0-9.]+) " + second + ":(-?[0-9.]+)"));
    return match ? [Number(match[1]), Number(match[2])] : null;
  }
  // Click the center of the row with the mouse. Then put the pointer back where it was.
  function click(element) {
    var position = numbers(element, "AXPosition", "x", "y");
    var size = numbers(element, "AXSize", "w", "h");
    if (!position || !size) return false;
    var point = { x: position[0] + size[0] / 2, y: position[1] + size[1] / 2 };
    var previous = $.CGEventGetLocation($.CGEventCreate(null));
    [5, 1, 2].forEach(function(type) {
      $.CGEventPost(0, $.CGEventCreateMouseEvent(null, type, point, 0));
      pause(0.05);
    });
    $.CGWarpMouseCursorPosition(previous);
    return true;
  }
  // Open a sidebar row with a mouse click. The app ignores the Accessibility press on sidebar rows.
  function openRow(root, element, key) {
    $.NSRunningApplication.runningApplicationWithProcessIdentifier(Number(argv[0])).activateWithOptions($.NSApplicationActivateIgnoringOtherApps);
    if (opened(root, key, 1)) return "open";
    pause(0.2);
    if (click(element) && opened(root, key, 6)) return "clicked";
    throw new Error("ROW_NOT_OPENED");
  }
  // Read the status indicator of a sidebar row. Do not read static text.
  function inspectRow(button, title) {
    var labels = [];
    var state = null;
    var read = false;
    var pending = children(button).map(function(child) { return { element: child, depth: 1 }; });
    while (pending.length && count++ < 6000) {
      var item = pending.pop();
      var role = scalar(item.element, "AXRole");
      if (role === "AXStaticText" || role === "AXTextArea" || role === "AXTextField") continue;
      var label = scalar(item.element, "AXDescription");
      if (typeof label === "string" && label) {
        labels.push(label);
        var indicator = scalar(item.element, "AXSubrole") === "AXApplicationStatus";
        if (rowStates.hasOwnProperty(label) && (role === "AXImage" || indicator)) {
          state = rowStates[label];
          read = seenLabels.hasOwnProperty(label);
        }
        // A working task shows its current activity, for example "Using the browser", in place of "Running".
        else if (indicator && !state) state = "working";
      }
      if (item.depth < 3) children(item.element).forEach(function(child) { pending.push({ element: child, depth: item.depth + 1 }); });
    }
    if (!state) return null;
    for (var index = 0; index < labels.length; index++) {
      if (title.indexOf(labels[index] + " ") === 0) return { state: state, read: read, title: title.slice(labels[index].length + 1) };
    }
    return { state: state, read: read, title: title };
  }
  try {
    var root = $.AXUIElementCreateApplication(Number(argv[0]));
    $.AXUIElementSetMessagingTimeout(root, 0.2);
    var pending = children(root, "AXWindows").map(function(window) { return { element: window, session: null, sidebar: false }; });
    var sessions = [];
    var rows = [];
    var seen = {};
    // The Usage page (Settings, Usage) shows the plan limits as two meters, each next to a "Resets ..." text.
    var usage = {};
    var meters = { "Current session": "session", "This week": "week" };
    while (pending.length && count++ < 6000) {
      var item = pending.pop();
      var element = item.element;
      var role = scalar(element, "AXRole");
      if (["AXStaticText", "AXMenu", "AXMenuBar", "AXImage"].indexOf(role) !== -1 || scalar(element, "AXHidden") === true) continue;
      var session = item.session;
      var sidebar = item.sidebar;
      if (role === "AXWebArea") {
        var location = scalar(element, "AXURL");
        var chat = typeof location === "string" && location.match(/^https:\/\/claude\.ai\/chat\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i);
        var task = !chat && typeof location === "string" && location.match(/^https:\/\/claude\.ai\/(?:cowork\/(cse_[0-9A-Za-z]{20,40})|code\/(session_[0-9A-Za-z]{20,40}))(?:[/?#]|$)/);
        // Other claude.ai pages, such as a new chat, still hold the sidebar.
        if (!chat && !task && !(typeof location === "string" && /^https:\/\/claude\.ai\//.test(location))) continue;
      }
      if (role === "AXWebArea" && (chat || task)) {
        var pageTitle = scalar(element, "AXTitle");
        session = { kind: chat ? "chat" : "task", sessionId: chat ? chat[1] : task[1] || task[2], working: false, waiting: false, composer: false, send: false };
        if (typeof pageTitle === "string" && / - Claude$/.test(pageTitle)) session.titleKey = titleKey(pageTitle.replace(/ - Claude$/, ""));
        sessions.push(session);
      }
      if (role === "AXLevelIndicator") {
        var meterTitle = scalar(element, "AXTitle");
        var slot = typeof meterTitle === "string" && meters.hasOwnProperty(meterTitle) ? meters[meterTitle] : null;
        var percent = slot ? parseFloat(String(scalar(element, "AXValue"))) : NaN;
        if (slot && isFinite(percent)) {
          var reset = null;
          var parent = attribute(element, "AXParent");
          // Both meters can share one group. Use the nearest "Resets ..." text before this meter, and read no other text.
          var siblings = parent ? children(parent) : [];
          for (var position = 0; position < siblings.length; position++) {
            var siblingRole = scalar(siblings[position], "AXRole");
            if (siblingRole === "AXLevelIndicator" && scalar(siblings[position], "AXTitle") === meterTitle) break;
            if (siblingRole !== "AXStaticText") continue;
            var label = scalar(siblings[position], "AXValue");
            if (typeof label === "string" && label.length <= 60 && /^\s*Resets /.test(label)) reset = label.trim();
          }
          usage[slot] = reset ? { percent: percent, reset: reset } : { percent: percent };
        }
        continue;
      }
      if (role === "AXGroup" && scalar(element, "AXSubrole") === "AXLandmarkComplementary" && scalar(element, "AXDescription") === "Sidebar") sidebar = true;
      if (sidebar && role === "AXButton") {
        var rowTitle = scalar(element, "AXTitle");
        var row = typeof rowTitle === "string" && rowTitle ? inspectRow(element, rowTitle) : null;
        if (row) {
          var key = titleKey(row.title);
          seen[key] = (seen[key] || 0) + 1;
          if (seen[key] > 1) key = key + "-" + seen[key];
          if (pressKey && key === pressKey) return openRow(root, element, key);
          if (row.state !== "idle") rows.push(row.read ? { kind: "row", sessionId: key, state: row.state, seen: true } : { kind: "row", sessionId: key, state: row.state });
        }
        continue;
      }
      if (session && !sidebar && (role === "AXPopUpButton" || role === "AXButton")) {
        var picker = scalar(element, "AXDescription");
        if (typeof picker === "string" && /^Model: ./.test(picker)) session.model = picker.slice(7, 127);
      }
      if (session && !sidebar && role === "AXButton") {
        var label = scalar(element, "AXTitle") || scalar(element, "AXDescription");
        var enabled = scalar(element, "AXEnabled") !== false;
        if (typeof label === "string") {
          if (enabled && /^(Stop|Stop response|Stop generating|Stop Claude)$/i.test(label)) session.working = true;
          if (enabled && /^(Allow|Allow once|Allow always|Approve|Approve once|Approve tool use)$/i.test(label)) session.waiting = true;
          if (/^(Send|Send message|Send prompt)$/i.test(label)) session.send = true;
        }
      }
      if (session && !sidebar && role === "AXTextArea" && scalar(element, "AXEnabled") !== false) session.composer = true;
      if (["AXTextArea", "AXTextField", "AXSecureTextField"].indexOf(role) !== -1) continue;
      var descendants = children(element);
      for (var index = 0; index < descendants.length; index++) pending.push({ element: descendants[index], session: session, sidebar: sidebar });
    }
    // A long conversation can pass the element limit. Report what was found, so that the hub keeps the other sessions.
    return snapshot(pending.length ? "partial" : "available", rows.concat(sessions.map(function(session) {
      var result = { kind: session.kind, sessionId: session.sessionId, state: session.waiting ? "waiting" : session.working ? "working" : session.composer && session.send ? "done" : "unknown" };
      if (session.titleKey) result.titleKey = session.titleKey;
      if (session.model) result.model = session.model;
      return result;
    })), usage);
  } catch (error) {
    if (pressKey) throw error;
    return snapshot("unavailable");
  }
}`;

async function inspectDesktop(processIdentifier: number): Promise<unknown> {
  const result = await execute("/usr/bin/osascript", ["-l", "JavaScript", "-e", claudeDesktopInspectionScript, "--", String(processIdentifier)], {
    timeout: inspectionTimeoutMilliseconds,
    maxBuffer: 64 * 1024,
  });
  return JSON.parse(result.stdout);
}

function identifierOf(session: ObservedSession): string {
  if (session.kind === "row") return `claude-row:${session.sessionId}`;
  return `${session.kind === "chat" ? "claude-chat" : "claude-task"}:${session.sessionId}`;
}

function labelOf(session: ObservedSession): string {
  if (session.kind === "row") return `Claude · ${session.sessionId.slice(0, 6)}`;
  return `${session.kind === "chat" ? "Claude chat" : "Claude task"} · ${session.sessionId.slice(-6)}`;
}

/**
 * Merge open pages into their sidebar rows. A row keeps one identity when the user opens or leaves it.
 * The sidebar status is preferred. The page status is used when the row status is unknown.
 */
function merge(sessions: Snapshot["sessions"]): Map<string, ObservedSession> {
  const observed = new Map<string, ObservedSession>();
  const add = (session: ObservedSession) => {
    const identifier = identifierOf(session);
    const previous = observed.get(identifier);
    observed.set(identifier, previous && previous.state !== session.state ? { ...session, state: "unknown" } : session);
  };
  const rows = new Map<string, ObservedSession>();
  for (const session of sessions) if (session.kind === "row") rows.set(session.sessionId, session);
  for (const session of sessions) {
    if (session.kind === "row") continue;
    const row = session.titleKey ? rows.get(session.titleKey) : undefined;
    if (!row) {
      add(session);
      continue;
    }
    if (row.state === "unknown") row.state = session.state;
    if (session.model) row.model = session.model;
    if (session.kind === "chat") row.conversationId = session.sessionId;
  }
  for (const row of rows.values()) add(row);
  return observed;
}

const missingSessionGraceMilliseconds = 15_000;

export class ClaudeDesktopTracker {
  readonly #tracked = new Set<string>();
  readonly #signatures = new Map<string, string>();
  // quiet: the completion needs no attention, because its time is not known or the user has read it in the app.
  readonly #observations = new Map<string, { state: string; transitionAt: string; quiet: boolean }>();
  // The model is visible only while a page is open. Keep the last model for each session.
  readonly #models = new Map<string, string>();
  // The app sorts its sidebar again when a task changes. A scan in that moment can miss rows.
  // Keep a missing session for a short time, so that it keeps its key position and its completion time.
  readonly #missingSince = new Map<string, number>();
  status: Snapshot["status"] = "unavailable";

  constructor(
    private readonly store: SessionStore,
    private readonly inspect: Inspector = inspectDesktop,
    private readonly now: () => number = Date.now,
    // With a budget store, the Usage page of the app updates the Claude budget while the page is open.
    private readonly budgets?: BudgetStore,
  ) {}

  get hasSessions(): boolean {
    return this.#tracked.size > 0 && (this.status === "available" || this.status === "partial");
  }

  async scan(processes: ProcessInfo[]): Promise<void> {
    const application = processes.find((candidate) => candidate.name.endsWith("/Claude.app/Contents/MacOS/Claude"));
    if (!application) {
      for (const identifier of this.#tracked) this.store.remove(identifier);
      this.#tracked.clear();
      this.#signatures.clear();
      this.#observations.clear();
      this.#models.clear();
      this.#missingSince.clear();
      this.status = "unavailable";
      return;
    }
    const snapshot = snapshotSchema.parse(await this.inspect(application.pid));
    this.status = snapshot.status;
    if (snapshot.status !== "available" && snapshot.status !== "partial") {
      this.unavailable(snapshot.status === "permission-denied" ? "ACCESSIBILITY_DENIED" : "ACCESSIBILITY_UNAVAILABLE");
      return;
    }
    if (snapshot.usage && this.budgets) {
      // The page does not show the plan. Keep the plan that the status line or a reporter gave.
      const budget = claudeUsageBudget(snapshot.usage, this.budgets.get("claude")?.plan, this.now());
      if (budget) this.budgets.upsert(budget, new Date(this.now()).toISOString());
    }
    const present = new Set<string>();
    for (const [identifier, session] of merge(snapshot.sessions)) {
      present.add(identifier);
      if (session.model) this.#models.set(identifier, claudeModelName(session.model));
      const model = this.#models.get(identifier);
      this.#missingSince.delete(identifier);
      const signature = JSON.stringify([session, model, application.pid, application.startedAt]);
      if (this.#signatures.get(identifier) === signature) continue;
      const observedAt = new Date(this.now()).toISOString();
      const previous = this.store.get(identifier);
      const known =
        this.#observations.get(identifier) ??
        (previous && previous.state !== "unknown"
          ? {
              state: previous.state,
              transitionAt: previous.stateChangedAt ?? previous.lastActivityAt,
              quiet: previous.metadata?.completionAttention === "none",
            }
          : undefined);
      const transitionAt = known?.state === session.state ? known.transitionAt : observedAt;
      // A session that is DONE when the hub first sees it has no known completion time. Do not flash it as a new result.
      const read = session.kind === "row" && session.seen === true;
      const quiet = session.state === "done" && (read || (known ? known.state === "done" && known.quiet : true));
      if (session.state !== "unknown") this.#observations.set(identifier, { state: session.state, transitionAt, quiet });
      // The deep-link contract covers chats only. Tasks and unmatched rows use application focus.
      const conversationId = session.kind === "chat" ? session.sessionId : session.conversationId;
      const rowKey = session.kind === "row" ? session.sessionId : undefined;
      const evidence =
        session.kind === "row"
          ? "Claude sidebar row with a status indicator"
          : session.kind === "chat"
            ? "Exposed Claude chat with a conversation URL"
            : "Exposed Claude task with a session URL";
      this.store.upsert(
        {
          id: identifier,
          source: "claude-desktop",
          harness: "claude-app",
          ...(model ? { model } : {}),
          label: labelOf(session),
          state: session.state,
          ended: false,
          focusTarget: {
            appName: "Claude",
            bundleId: "com.anthropic.claudefordesktop",
            pid: application.pid,
            ...(conversationId ? { claudeConversationId: conversationId } : {}),
            ...(rowKey && !conversationId ? { claudeRowKey: rowKey } : {}),
          },
          metadata: {
            sessionId: session.sessionId,
            host: "Claude",
            ownerPid: String(application.pid),
            tracking: "claude-accessibility",
            stateEvent: `desktop.${session.state}`,
            telemetryStatus: session.state === "unknown" ? "unrecognized" : "available",
            telemetryLocation: session.kind === "row" ? "Claude desktop sidebar" : "Claude desktop Accessibility controls",
            lastTelemetryAt: observedAt,
            hostLifetime: "open",
            hostEvidence: evidence,
            ...(quiet ? { completionAttention: "none" } : {}),
          },
        },
        observedAt,
        transitionAt,
      );
      this.#signatures.set(identifier, signature);
      this.#tracked.add(identifier);
    }
    for (const identifier of this.#tracked) {
      if (present.has(identifier)) continue;
      // A partial scan does not prove that a session is gone.
      if (snapshot.status === "partial") continue;
      const missingSince = this.#missingSince.get(identifier) ?? this.now();
      this.#missingSince.set(identifier, missingSince);
      if (this.now() - missingSince < missingSessionGraceMilliseconds) continue;
      this.#missingSince.delete(identifier);
      this.store.remove(identifier);
      this.#tracked.delete(identifier);
      this.#signatures.delete(identifier);
      this.#observations.delete(identifier);
      this.#models.delete(identifier);
    }
  }

  unavailable(errorCode = "ACCESSIBILITY_UNAVAILABLE"): void {
    this.status = errorCode === "ACCESSIBILITY_DENIED" ? "permission-denied" : "unavailable";
    for (const identifier of this.#tracked) {
      const session = this.store.get(identifier);
      if (session && session.state !== "unknown") {
        this.store.upsert(
          {
            ...session,
            state: "unknown",
            metadata: { ...session.metadata, stateEvent: "desktop.unavailable", telemetryStatus: "unreadable", telemetryError: errorCode },
          },
          session.lastActivityAt,
          new Date().toISOString(),
        );
      }
      this.#signatures.delete(identifier);
    }
  }
}
