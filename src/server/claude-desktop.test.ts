import { afterEach, describe, expect, it, vi } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import { ClaudeDesktopTracker, claudeDesktopInspectionScript, claudeModelName } from "./claude-desktop.js";
import { SessionStore } from "./store.js";
import { doneAttention } from "../shared/attention.js";

const sessionId = "6ef2c5c7-a520-49a1-b6fb-5b3831863a22";
const taskId = "cse_019ewEg4CX1aSU5w19VAT66W";
const codeTaskId = "session_019ewEg4CX1aSU5w19VAT66W";
const application = { pid: 10, parentPid: 1, name: "/Applications/Claude.app/Contents/MacOS/Claude" };
const stores: SessionStore[] = [];

interface NativeElement {
  role: string;
  attributes: Record<string, unknown>;
  children: NativeElement[];
}

function element(role: string, attributes: Record<string, unknown> = {}, children: NativeElement[] = []): NativeElement {
  return { role, attributes, children };
}

// Build a sidebar row like the Claude desktop app 1.x exposes it. Static text holds the title and must not be read.
function row(prefix: string, indicator: NativeElement, title: string): NativeElement {
  return element("AXGroup", {}, [element("AXGroup", {}, [
    element("AXButton", { AXTitle: `${prefix} ${title}` }, [indicator, element("AXGroup", {}, [element("AXStaticText", { AXValue: title })])]),
    element("AXGroup", {}, [element("AXPopUpButton", { AXDescription: `More options for ${title}` })]),
  ])]);
}
const status = (label: string) => element("AXGroup", { AXSubrole: "AXApplicationStatus", AXDescription: label });
const running = (title: string) => row("Running", element("AXGroup", {}, [status("Running")]), title);
const awaiting = (title: string) => row("Awaiting input", status("Awaiting input"), title);
const unread = (title: string) => row("Mark as read", element("AXButton", { AXDescription: "Mark as read" }, [status("Unread response")]), title);
const done = (title: string) => row("Mark as unread", element("AXButton", { AXDescription: "Mark as unread" }, [element("AXImage", { AXDescription: "Done" })]), title);
const idle = (title: string) => row("Idle", element("AXImage", { AXDescription: "Idle" }), title);
const activity = (label: string, title: string) => row(label, element("AXGroup", {}, [status(label)]), title);
function sidebar(rows: NativeElement[]): NativeElement {
  return element("AXGroup", { AXSubrole: "AXLandmarkComplementary", AXDescription: "Sidebar" }, [
    element("AXButton", { AXTitle: "New" }),
    element("AXButton", { AXDescription: "tecost presentation" }),
    element("AXHeading", { AXTitle: "Chats and tasks" }, [element("AXButton", { AXTitle: "Chats and tasks" })]),
    ...rows,
  ]);
}

/**
 * Read a tree that scripts/claude-ax-tree.js printed. Each line is "<role> <Name>=<JSON string> ...", indented by two spaces for each level.
 * Remove titles, message text, and personal names before you add a new fixture.
 */
function parseTree(text: string): NativeElement[] {
  const roots: NativeElement[] = [];
  const stack: { depth: number; node: NativeElement }[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const depth = (line.length - line.trimStart().length) / 2;
    const attributes: Record<string, unknown> = {};
    for (const match of line.matchAll(/(\w+)=("(?:[^"\\]|\\.)*")/g)) attributes[`AX${match[1]}`] = JSON.parse(match[2]);
    if (/ disabled(?: |$)/.test(line)) attributes.AXEnabled = false;
    const node = element(line.trim().split(" ")[0], attributes);
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
    (stack.length ? stack[stack.length - 1].node.children : roots).push(node);
    stack.push({ depth, node });
  }
  return roots;
}

interface InspectOptions {
  trusted?: boolean;
  location?: string;
  title?: string;
  windows?: NativeElement[];
  pressKey?: string;
  /** Simulate the reaction of the app to a mouse click. */
  onClick?: (point: { x: number; y: number }) => void;
}

function inspect(controls: NativeElement[], options: InspectOptions = {}) {
  const inspected = vi.fn();
  const pressed = vi.fn((_entry: NativeElement, _action: string) => 0);
  const activated = vi.fn();
  const posted = vi.fn();
  const warped = vi.fn();
  const cursor = { x: 1, y: 2 };
  const page = { AXURL: options.location ?? `https://claude.ai/chat/${sessionId}`, ...(options.title ? { AXTitle: options.title } : {}) };
  const windows = options.windows ?? [element("AXWindow", {}, [element("AXWebArea", page, controls)])];
  const references = new WeakMap<object, unknown>();
  const reference = (value: unknown) => {
    const pointer = {};
    references.set(pointer, value);
    return pointer;
  };
  const array = (values: NativeElement[]) => ({ count: values.length, objectAtIndex: (index: number) => values[index] });
  const bridge = Object.assign((value: unknown) => value, {
    AXIsProcessTrusted: () => options.trusted ?? true,
    AXUIElementCreateApplication: () => element("AXApplication"),
    AXUIElementSetMessagingTimeout: vi.fn(),
    AXUIElementPerformAction: pressed,
    NSApplicationActivateIgnoringOtherApps: 2,
    NSRunningApplication: { runningApplicationWithProcessIdentifier: (pid: number) => ({ activateWithOptions: () => activated(pid) }) },
    CGEventCreate: () => ({}),
    CGEventGetLocation: () => cursor,
    CGEventCreateMouseEvent: (_source: unknown, type: number, point: { x: number; y: number }) => ({ type, point }),
    CGEventPost: (_tap: number, event: { type: number; point: { x: number; y: number } }) => {
      posted(event.type, event.point);
      if (event.type === 2) options.onClick?.(event.point);
    },
    CGWarpMouseCursorPosition: warped,
    AXUIElementCopyAttributeValue: (entry: NativeElement, attribute: string, output: unknown[]) => {
      inspected(entry.role, attribute);
      let value: unknown;
      if (attribute === "AXRole") value = entry.role;
      else if (attribute === "AXWindows") value = array(windows);
      else if (attribute === "AXChildren") value = array(entry.children);
      else if (attribute === "AXPosition" || attribute === "AXSize") value = entry.attributes[attribute] === undefined ? undefined : { description: entry.attributes[attribute] };
      else if (attribute === "AXURL") value = entry.attributes.AXURL === undefined ? undefined : { isKindOfClass: () => true, absoluteString: entry.attributes.AXURL };
      else value = entry.attributes[attribute];
      if (value === undefined) return -25205;
      output[0] = reference(value);
      return 0;
    },
  });
  const script = new Function("ObjC", "$", "Ref", "argv", `${claudeDesktopInspectionScript}; return run(argv);`);
  const argv = options.pressKey ? ["10", options.pressKey] : ["10"];
  const result = script({ import: vi.fn(), castRefToObject: (value: object) => references.get(value), unwrap: (value: unknown) => value }, bridge, () => [], argv);
  return { snapshot: options.pressKey ? result : JSON.parse(result), inspected, pressed, activated, posted, warped, cursor };
}

afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.close()));
  vi.useRealTimers();
});

describe("Claude desktop chat inspection", () => {
  it.skipIf(process.platform !== "darwin")("converts native URL and array references without reading an application", async () => {
    const helpers = claudeDesktopInspectionScript.slice(claudeDesktopInspectionScript.indexOf("  function scalar"), claudeDesktopInspectionScript.indexOf("  try {"));
    const script = `
      ObjC.import("Foundation");
      ObjC.import("CoreFoundation");
      function attribute(element, name) { return element; }
      ${helpers}
      var location = $.CFURLCreateWithString(null, $("https://claude.ai/chat/${sessionId}"), null);
      var entries = $.CFArrayCreateMutable(null, 0, null);
      $.CFArrayAppendValue(entries, location);
      JSON.stringify({ url: scalar(location, "AXURL"), count: children(entries).length });
    `;
    const result = await promisify(execFile)("/usr/bin/osascript", ["-l", "JavaScript", "-e", script], { timeout: 8000 });
    expect(JSON.parse(result.stdout)).toEqual({ url: `https://claude.ai/chat/${sessionId}`, count: 1 });
  });

  it("uses a real conversation URL and Stop control to identify work without reading content", () => {
    const result = inspect([
      element("AXButton", { AXDescription: "Stop response" }),
      element("AXStaticText", { AXValue: "private-response" }),
      element("AXTextArea", { AXValue: "private-prompt" }),
    ]);
    expect(result.snapshot).toEqual({ status: "available", sessions: [{ kind: "chat", sessionId, state: "working" }] });
    expect(result.inspected.mock.calls.some(([, attribute]) => attribute === "AXValue")).toBe(false);
    expect(result.inspected.mock.calls.some(([role, attribute]) => role === "AXStaticText" && attribute !== "AXRole")).toBe(false);
    expect(JSON.stringify(result.snapshot)).not.toContain("private-");
  });

  it("distinguishes input-required controls, completed chats, and unrecognized controls", () => {
    expect(inspect([element("AXButton", { AXTitle: "Allow once" })]).snapshot.sessions[0].state).toBe("waiting");
    expect(inspect([element("AXTextArea"), element("AXButton", { AXTitle: "Send message", AXEnabled: false })]).snapshot.sessions[0].state).toBe("done");
    expect(inspect([]).snapshot.sessions[0].state).toBe("unknown");
  });

  it("identifies Claude Code and Cowork tasks from their session URL", () => {
    const working = inspect([element("AXButton", { AXDescription: "Stop" })], { location: `https://claude.ai/cowork/${taskId}` });
    expect(working.snapshot).toEqual({ status: "available", sessions: [{ kind: "task", sessionId: taskId, state: "working" }] });
    expect(inspect([element("AXButton", { AXTitle: "Allow" })], { location: `https://claude.ai/cowork/${taskId}?tab=1` }).snapshot.sessions[0].state).toBe("waiting");
    expect(inspect([], { location: `https://claude.ai/code/${codeTaskId}` }).snapshot.sessions).toEqual([{ kind: "task", sessionId: codeTaskId, state: "unknown" }]);
    expect(inspect([], { location: `https://claude.ai/code/${taskId}` }).snapshot.sessions).toEqual([]);
    expect(inspect([], { location: "https://claude.ai/cowork/cse_short" }).snapshot.sessions).toEqual([]);
    expect(inspect([], { location: "file:///Applications/Claude.app/Contents/Resources/app.asar/.vite/renderer/main_window/index.html" }).snapshot.sessions).toEqual([]);
    expect(inspect([], { location: "https://claude.ai/code" }).snapshot.sessions).toEqual([]);
  });

  it("reports each active sidebar row with a title key and no title text", () => {
    const result = inspect([sidebar([
      unread("private-a"), running("private-b"), done("private-c"), awaiting("private-d"), idle("private-e"),
    ])], { location: "https://claude.ai/new" });
    expect(result.snapshot.status).toBe("available");
    const rows = result.snapshot.sessions;
    expect(rows.map((session: { state: string }) => session.state).sort()).toEqual(["done", "done", "waiting", "working"]);
    for (const session of rows) expect(session).toMatchObject({ kind: "row", sessionId: expect.stringMatching(/^[0-9a-f]{16}$/) });
    expect(new Set(rows.map((session: { sessionId: string }) => session.sessionId)).size).toBe(4);
    expect(JSON.stringify(result.snapshot)).not.toContain("private-");
    // The read row (Done) has seen; the unread row (Unread response) does not.
    expect(rows.filter((session: { seen?: boolean }) => session.seen === true)).toHaveLength(1);
    expect(result.inspected.mock.calls.some(([role, attribute]) => role === "AXStaticText" && attribute !== "AXRole")).toBe(false);
  });

  it("reports a row that shows its current activity as working and keeps the same key", () => {
    const running = inspect([sidebar([row("Running", element("AXGroup", {}, [status("Running")]), "Task")])], { location: "https://claude.ai/new" });
    const browsing = inspect([sidebar([activity("Using the browser", "Task")])], { location: "https://claude.ai/new" });
    expect(browsing.snapshot.sessions).toEqual([{ kind: "row", sessionId: running.snapshot.sessions[0].sessionId, state: "working" }]);
    const states = ["Awaiting answer", "Completed", "Error", "Archived"].map((label) => inspect([sidebar([activity(label, "Task")])], { location: "https://claude.ai/new" }).snapshot.sessions[0]?.state);
    expect(states).toEqual(["waiting", "done", "failed", undefined]);
  });

  it("gives rows with the same title different keys and does not apply page controls to the sidebar", () => {
    const result = inspect([sidebar([running("Same"), running("Same"), row("Stop", status("Running"), "x")])], { location: `https://claude.ai/cowork/${taskId}` });
    const keys = result.snapshot.sessions.filter((session: { kind: string }) => session.kind === "row").map((session: { sessionId: string }) => session.sessionId);
    expect(keys).toHaveLength(3);
    expect(keys.filter((key: string) => key.endsWith("-2"))).toHaveLength(1);
    expect(result.snapshot.sessions.find((session: { kind: string }) => session.kind === "task").state).toBe("unknown");
  });

  it("gives the open page the title key of its sidebar row", () => {
    const result = inspect([sidebar([running("Ping")])], { location: `https://claude.ai/cowork/${taskId}`, title: "Ping - Claude" });
    const [rowSession, page] = result.snapshot.sessions;
    expect(page).toMatchObject({ kind: "task", sessionId: taskId, titleKey: rowSession.sessionId });
  });

  it("reads the recorded Claude 1.x Cowork window with three running tasks", () => {
    const windows = parseTree(readFileSync(new URL("./fixtures/claude-desktop-cowork-sidebar.txt", import.meta.url), "utf8"));
    const { snapshot } = inspect([], { windows });
    expect(snapshot.status).toBe("available");
    const rows = snapshot.sessions.filter((session: { kind: string }) => session.kind === "row");
    const count = (state: string) => rows.filter((session: { state: string }) => session.state === state).length;
    expect({ working: count("working"), waiting: count("waiting"), done: count("done"), total: rows.length }).toEqual({ working: 3, waiting: 1, done: 3, total: 7 });
    // "Mark as unread" rows are read (Done). The fixture has no unread row.
    expect(rows.filter((session: { seen?: boolean }) => session.seen === true)).toHaveLength(3);
    expect(rows.filter((session: { state: string; seen?: boolean }) => session.state !== "done" && session.seen)).toHaveLength(0);
    const page = snapshot.sessions.find((session: { kind: string }) => session.kind === "task");
    expect(page).toMatchObject({ sessionId: "cse_000000000000000000000001", state: "working" });
    expect(rows.find((session: { sessionId: string }) => session.sessionId === page.titleKey)?.state).toBe("working");
    expect(page.model).toBe("Opus 5.5 Medium");
    expect(rows.every((session: { model?: string }) => session.model === undefined)).toBe(true);
  });

  it("reads the model picker of the open page but not of the sidebar", () => {
    const result = inspect([
      sidebar([element("AXPopUpButton", { AXDescription: "Model: Sidebar 1" })]),
      element("AXPopUpButton", { AXDescription: "Model: Sonnet 5 High" }),
    ], { location: `https://claude.ai/cowork/${taskId}` });
    expect(result.snapshot.sessions[0]).toMatchObject({ kind: "task", model: "Sonnet 5 High" });
    expect(claudeModelName("Opus 5.5 Medium")).toBe("claude-opus-5-5");
    expect(claudeModelName("Sonnet 5 High")).toBe("claude-sonnet-5");
    expect(claudeModelName("Some future model")).toBe("Some future model");
  });

  describe("opening a sidebar row", () => {
    const fixture = () => parseTree(readFileSync(new URL("./fixtures/claude-desktop-cowork-sidebar.txt", import.meta.url), "utf8"));
    const find = (nodes: NativeElement[], test: (node: NativeElement) => boolean): NativeElement | undefined => {
      for (const node of nodes) {
        if (test(node)) return node;
        const found = find(node.children, test);
        if (found) return found;
      }
      return undefined;
    };
    const page = (windows: NativeElement[]) => find(windows, (node) => node.role === "AXWebArea" && String(node.attributes.AXURL).startsWith("https://claude.ai/"))!;
    const rowFor = (windows: NativeElement[], title: string) => find(windows, (node) => node.role === "AXButton" && node.attributes.AXTitle === title)!;
    const keyOf = (windows: NativeElement[], state: string) => inspect([], { windows }).snapshot.sessions.find((session: { kind: string; state: string }) => session.kind === "row" && session.state === state).sessionId;
    const open = (windows: NativeElement[], title: string) => { page(windows).attributes.AXTitle = `${title} - Claude`; };

    it("clicks the center of the row without an Accessibility press, then restores the pointer", () => {
      const windows = fixture();
      Object.assign(rowFor(windows, "Awaiting input Task 8").attributes, { AXPosition: "{value = x:100.000000 y:200.000000 type = kAXValueCGPointType}", AXSize: "{value = w:240.000000 h:30.000000 type = kAXValueCGSizeType}" });
      const result = inspect([], { windows, pressKey: keyOf(windows, "waiting"), onClick: () => open(windows, "Task 8") });
      expect(result.snapshot).toBe("clicked");
      expect(result.pressed).not.toHaveBeenCalled();
      expect(result.posted.mock.calls).toEqual([[5, { x: 220, y: 215 }], [1, { x: 220, y: 215 }], [2, { x: 220, y: 215 }]]);
      expect(result.warped).toHaveBeenCalledWith(result.cursor);
      expect(result.activated).toHaveBeenCalledWith(10);
    });

    it("reports an already open row without pressing it", () => {
      const windows = fixture();
      open(windows, "Task 8");
      const result = inspect([], { windows, pressKey: keyOf(windows, "waiting") });
      expect(result.snapshot).toBe("open");
      expect(result.posted).not.toHaveBeenCalled();
      expect(result.activated).toHaveBeenCalledWith(10);
    });

    it("throws when the row does not open, is missing, or access is denied", () => {
      const windows = fixture();
      Object.assign(rowFor(windows, "Awaiting input Task 8").attributes, { AXPosition: "x:1.0 y:1.0", AXSize: "w:1.0 h:1.0" });
      expect(() => inspect([], { windows, pressKey: keyOf(windows, "waiting") })).toThrow("ROW_NOT_OPENED");
      expect(() => inspect([], { windows, pressKey: "0000000000000000" })).toThrow("ROW_NOT_PRESSED");
      expect(() => inspect([], { windows, pressKey: "0000000000000000", trusted: false })).toThrow("ROW_NOT_PRESSED");
    });
  });

  it("does not create sessions from app presence, sidebar links, or denied permissions", () => {
    expect(inspect([], { trusted: false }).snapshot).toEqual({ status: "permission-denied", sessions: [] });
    expect(inspect([element("AXLink", { AXURL: `https://claude.ai/chat/${sessionId}` })], { location: "https://claude.ai/new" }).snapshot.sessions).toEqual([]);
    expect(inspect([], { location: `https://other.example/chat/${sessionId}` }).snapshot.sessions).toEqual([]);
  });
});

describe("Claude desktop chat tracking", () => {
  it("tracks individual exposed chats and removes them when no longer exposed or when the app exits", async () => {
    const store = new SessionStore();
    stores.push(store);
    const read = vi.fn(async () => ({ status: "available", sessions: [{ sessionId, state: "working" }] }));
    let clock = Date.parse("2026-11-01T10:00:00Z");
    const tracker = new ClaudeDesktopTracker(store, read, () => clock);
    await tracker.scan([application]);
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]).toMatchObject({ harness: "claude-app", state: "working", focusTarget: { claudeConversationId: sessionId } });
    const before = store.list()[0];
    await tracker.scan([application]);
    expect(store.list()[0]).toBe(before);
    read.mockResolvedValue({ status: "available", sessions: [] });
    await tracker.scan([application]);
    expect(store.list()).toHaveLength(1);
    clock += 15_000;
    await tracker.scan([application]);
    expect(store.list()).toEqual([]);
    await tracker.scan([application]);
    await tracker.scan([]);
    expect(store.list()).toEqual([]);
  });

  it("keeps a session that a scan misses for a moment, with its key position and completion time", async () => {
    const store = new SessionStore();
    stores.push(store);
    let clock = Date.parse("2026-11-01T10:00:00Z");
    const rows = [{ kind: "row", sessionId: "0123456789abcdef", state: "working" }, { kind: "row", sessionId: "fedcba9876543210", state: "working" }];
    const read = vi.fn(async () => ({ status: "available", sessions: rows }));
    const tracker = new ClaudeDesktopTracker(store, read, () => clock);
    await tracker.scan([application]);
    rows[1] = { ...rows[1], state: "done" };
    clock += 2000;
    await tracker.scan([application]);
    const finished = store.get("claude-row:fedcba9876543210")!;
    const created = store.get("claude-row:0123456789abcdef")!.createdAt;
    // The app sorts the sidebar again. One scan misses the first row, and a partial scan misses both.
    read.mockResolvedValueOnce({ status: "available", sessions: [rows[1]] });
    clock += 1500;
    await tracker.scan([application]);
    read.mockResolvedValueOnce({ status: "partial", sessions: [] });
    clock += 1500;
    await tracker.scan([application]);
    clock += 1500;
    await tracker.scan([application]);
    expect(store.get("claude-row:0123456789abcdef")?.createdAt).toBe(created);
    expect(store.get("claude-row:fedcba9876543210")?.stateChangedAt).toBe(finished.stateChangedAt);
    expect(tracker.hasSessions).toBe(true);
  });

  it("flashes a completion that it sees happen, and stops when the app shows the row as read", async () => {
    const store = new SessionStore();
    stores.push(store);
    let clock = Date.parse("2026-11-01T10:00:00Z");
    const row = { kind: "row", sessionId: "0123456789abcdef", state: "working" } as Record<string, unknown>;
    const old = { kind: "row", sessionId: "fedcba9876543210", state: "done" };
    const tracker = new ClaudeDesktopTracker(store, async () => ({ status: "available", sessions: [row, old] }), () => clock);
    await tracker.scan([application]);
    // A row that is already DONE at the first scan has no known completion time.
    expect(doneAttention(store.get("claude-row:fedcba9876543210")!, clock)?.phase).toBe("aged");
    Object.assign(row, { state: "done" });
    clock += 1000;
    await tracker.scan([application]);
    const fresh = store.get("claude-row:0123456789abcdef")!;
    expect(fresh.metadata?.completionAttention).toBeUndefined();
    expect(doneAttention(fresh, clock + 100)?.phase).toBe("bright");
    Object.assign(row, { seen: true });
    clock += 1000;
    await tracker.scan([application]);
    expect(doneAttention(store.get("claude-row:0123456789abcdef")!, clock)?.phase).toBe("aged");
    Object.assign(row, { state: "working", seen: undefined });
    clock += 1000;
    await tracker.scan([application]);
    expect(store.get("claude-row:0123456789abcdef")?.metadata?.completionAttention).toBeUndefined();
  });

  it("retains UNKNOWN on denied inspection, then recovers without restarting completion attention", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-26T08:00:00Z"));
    const store = new SessionStore();
    stores.push(store);
    const read = vi.fn().mockResolvedValueOnce({ status: "available", sessions: [{ sessionId, state: "done" }] })
      .mockResolvedValueOnce({ status: "permission-denied", sessions: [] })
      .mockResolvedValueOnce({ status: "available", sessions: [{ sessionId, state: "done" }] });
    const tracker = new ClaudeDesktopTracker(store, read);
    await tracker.scan([application]);
    const completedAt = store.list()[0].stateChangedAt;
    vi.setSystemTime(new Date("2026-10-26T08:01:00Z"));
    await tracker.scan([application]);
    expect(store.list()[0]).toMatchObject({ state: "unknown", metadata: { telemetryError: "ACCESSIBILITY_DENIED" } });
    await tracker.scan([application]);
    expect(store.list()[0].state).toBe("done");
    expect(store.list()[0].stateChangedAt).toBe(completedAt);
  });

  it("tracks tasks with application focus because the deep-link contract covers chats only", async () => {
    const store = new SessionStore();
    stores.push(store);
    const tracker = new ClaudeDesktopTracker(store, async () => ({ status: "available", sessions: [{ kind: "task", sessionId: taskId, state: "working" }] }));
    await tracker.scan([application]);
    expect(store.list()).toHaveLength(1);
    const [session] = store.list();
    expect(session).toMatchObject({ id: `claude-task:${taskId}`, harness: "claude-app", state: "working", label: "Claude task · VAT66W" });
    expect(session.focusTarget).toEqual({ appName: "Claude", bundleId: "com.anthropic.claudefordesktop", pid: application.pid });
  });

  it("rejects malformed task identifiers from the inspector", async () => {
    const store = new SessionStore();
    stores.push(store);
    const tracker = new ClaudeDesktopTracker(store, async () => ({ status: "available", sessions: [{ kind: "task", sessionId: "session_../x", state: "working" }] }));
    await expect(tracker.scan([application])).rejects.toThrow();
    expect(store.list()).toEqual([]);
  });

  it("tracks each sidebar row as a session and merges the open page into its row", async () => {
    const store = new SessionStore();
    stores.push(store);
    const read = vi.fn(async () => ({ status: "available", sessions: [
      { kind: "row", sessionId: "0123456789abcdef", state: "working" },
      { kind: "row", sessionId: "fedcba9876543210", state: "waiting" },
      { kind: "chat", sessionId, titleKey: "fedcba9876543210", state: "done" },
      { kind: "task", sessionId: taskId, titleKey: "0123456789abcdef", state: "unknown" },
    ] }));
    const tracker = new ClaudeDesktopTracker(store, read);
    await tracker.scan([application]);
    const sessions = store.list();
    expect(sessions.map((session) => session.id).sort()).toEqual(["claude-row:0123456789abcdef", "claude-row:fedcba9876543210"]);
    expect(store.get("claude-row:0123456789abcdef")).toMatchObject({ state: "working", label: "Claude · 012345" });
    expect(store.get("claude-row:fedcba9876543210")).toMatchObject({ state: "waiting", focusTarget: { claudeConversationId: sessionId } });
    expect(store.get("claude-row:0123456789abcdef")?.focusTarget).toMatchObject({ claudeRowKey: "0123456789abcdef", pid: application.pid });
    expect(store.get("claude-row:0123456789abcdef")?.focusTarget?.claudeConversationId).toBeUndefined();
    expect(store.get("claude-row:fedcba9876543210")?.focusTarget?.claudeRowKey).toBeUndefined();
  });

  it("keeps the row identity when the user leaves the open page", async () => {
    const store = new SessionStore();
    stores.push(store);
    const read = vi.fn()
      .mockResolvedValueOnce({ status: "available", sessions: [{ kind: "row", sessionId: "0123456789abcdef", state: "working" }, { kind: "task", sessionId: taskId, titleKey: "0123456789abcdef", model: "Opus 5.5 Medium", state: "working" }] })
      .mockResolvedValueOnce({ status: "available", sessions: [{ kind: "row", sessionId: "0123456789abcdef", state: "done" }] });
    const tracker = new ClaudeDesktopTracker(store, read);
    await tracker.scan([application]);
    const createdAt = store.list()[0].createdAt;
    expect(store.list()[0].model).toBe("claude-opus-5-5");
    await tracker.scan([application]);
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0].model).toBe("claude-opus-5-5");
    expect(store.list()[0]).toMatchObject({ id: "claude-row:0123456789abcdef", state: "done", createdAt });
  });

  it("reports conflicting states for the same conversation as UNKNOWN", async () => {
    const store = new SessionStore();
    stores.push(store);
    const tracker = new ClaudeDesktopTracker(store, async () => ({ status: "available", sessions: [{ sessionId, state: "working" }, { sessionId, state: "done" }] }));
    await tracker.scan([application]);
    expect(store.list()[0].state).toBe("unknown");
  });
});
