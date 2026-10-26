import { afterEach, describe, expect, it, vi } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ClaudeDesktopTracker, claudeDesktopInspectionScript } from "./claude-desktop.js";
import { SessionStore } from "./store.js";

const sessionId = "6ef2c5c7-a520-49a1-b6fb-5b3831863a22";
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

function inspect(controls: NativeElement[], options: { trusted?: boolean; location?: string } = {}) {
  const inspected = vi.fn();
  const windows = [element("AXWindow", {}, [element("AXWebArea", { AXURL: options.location ?? `https://claude.ai/chat/${sessionId}` }, controls)])];
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
    AXUIElementCopyAttributeValue: (entry: NativeElement, attribute: string, output: unknown[]) => {
      inspected(entry.role, attribute);
      let value: unknown;
      if (attribute === "AXRole") value = entry.role;
      else if (attribute === "AXWindows") value = array(windows);
      else if (attribute === "AXChildren") value = array(entry.children);
      else if (attribute === "AXURL") value = { isKindOfClass: () => true, absoluteString: entry.attributes.AXURL };
      else value = entry.attributes[attribute];
      if (value === undefined) return -25205;
      output[0] = reference(value);
      return 0;
    },
  });
  const script = new Function("ObjC", "$", "Ref", "argv", `${claudeDesktopInspectionScript}; return run(argv);`);
  const result = script({ import: vi.fn(), castRefToObject: (value: object) => references.get(value), unwrap: (value: unknown) => value }, bridge, () => [], ["10"]);
  return { snapshot: JSON.parse(result), inspected };
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
    expect(result.snapshot).toEqual({ status: "available", sessions: [{ sessionId, state: "working" }] });
    expect(result.inspected.mock.calls.some(([, attribute]) => attribute === "AXValue")).toBe(false);
    expect(result.inspected.mock.calls.some(([role, attribute]) => role === "AXStaticText" && attribute !== "AXRole")).toBe(false);
    expect(JSON.stringify(result.snapshot)).not.toContain("private-");
  });

  it("distinguishes input-required controls, completed chats, and unrecognized controls", () => {
    expect(inspect([element("AXButton", { AXTitle: "Allow once" })]).snapshot.sessions[0].state).toBe("waiting");
    expect(inspect([element("AXTextArea"), element("AXButton", { AXTitle: "Send message", AXEnabled: false })]).snapshot.sessions[0].state).toBe("done");
    expect(inspect([]).snapshot.sessions[0].state).toBe("unknown");
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
    const tracker = new ClaudeDesktopTracker(store, read);
    await tracker.scan([application]);
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]).toMatchObject({ harness: "claude-app", state: "working", focusTarget: { claudeConversationId: sessionId } });
    const before = store.list()[0];
    await tracker.scan([application]);
    expect(store.list()[0]).toBe(before);
    read.mockResolvedValueOnce({ status: "available", sessions: [] });
    await tracker.scan([application]);
    expect(store.list()).toEqual([]);
    await tracker.scan([application]);
    await tracker.scan([]);
    expect(store.list()).toEqual([]);
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

  it("reports conflicting states for the same conversation as UNKNOWN", async () => {
    const store = new SessionStore();
    stores.push(store);
    const tracker = new ClaudeDesktopTracker(store, async () => ({ status: "available", sessions: [{ sessionId, state: "working" }, { sessionId, state: "done" }] }));
    await tracker.scan([application]);
    expect(store.list()[0].state).toBe("unknown");
  });
});
