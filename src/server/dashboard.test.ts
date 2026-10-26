import { afterEach, describe, expect, it, vi } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { browserDetectionScript, canonicalDashboardUrl, createDashboardController, dashboardOpenScript, type DashboardBrowser } from "./dashboard.js";
import { createApp } from "./app.js";

const target = "http://127.0.0.1:43681/";
const zen: DashboardBrowser = { id: "app.zen-browser.zen", name: "Zen", adapter: "accessibility", accessibilityTrusted: true };
const chrome: DashboardBrowser = { id: "com.google.Chrome", name: "Google Chrome", adapter: "chromium", accessibilityTrusted: false };

interface NativeElement {
  attributes: Record<string, unknown>;
  children: NativeElement[];
  url?: string;
}

function element(role: string, attributes: Record<string, unknown> = {}, children: NativeElement[] = []): NativeElement {
  return { attributes: { AXRole: role, ...attributes }, children };
}

function scriptHarness(options: { browser?: DashboardBrowser; windows?: unknown[]; nativeWindows?: NativeElement[]; trusted?: boolean; running?: boolean } = {}) {
  const opened = vi.fn(() => true);
  const activated = vi.fn(() => true);
  const pressed = vi.fn();
  const inspected = vi.fn();
  const address = element("AXComboBox", { AXValue: "https://example.com/" });
  const references = new WeakMap<object, unknown>();
  const reference = (value: unknown) => {
    const wrapped = {};
    references.set(wrapped, value);
    return wrapped;
  };
  const array = (values: unknown[]) => ({ count: values.length, objectAtIndex: (index: number) => values[index] });
  const root = element("AXApplication", { AXWindows: array(options.nativeWindows ?? []) });
  const nativeApplication = { processIdentifier: 42, activateWithOptions: activated };
  const scripting = { windows: () => options.windows ?? [], activate: activated };
  const bridge = Object.assign((value: unknown) => value, {
    NSWorkspace: { sharedWorkspace: { openURL: opened } },
    NSURL: { URLWithString: (value: string) => value },
    NSRunningApplication: { runningApplicationsWithBundleIdentifier: () => array(options.running === false ? [] : [nativeApplication]) },
    NSApplicationActivateIgnoringOtherApps: 2,
    AXIsProcessTrusted: () => options.trusted ?? true,
    AXUIElementCreateApplication: () => root,
    AXUIElementSetMessagingTimeout: vi.fn(),
    AXUIElementCopyAttributeValue: (entry: NativeElement, attribute: string, output: unknown[]) => {
      inspected(entry, attribute);
      if (attribute === "AXChildren") output[0] = reference(array(entry.children));
      else if (Object.hasOwn(entry.attributes, attribute)) output[0] = reference(entry.attributes[attribute]);
      else return -25205;
      return 0;
    },
    AXUIElementPerformAction: (entry: NativeElement, action: string) => {
      pressed(entry, action);
      if (action === "AXPress" && entry.url) address.attributes.AXValue = entry.url;
      return 0;
    },
  });
  return {
    opened, activated, pressed, inspected, address,
    run(browser = options.browser ?? zen, url = target) {
      const script = new Function("ObjC", "$", "Application", "Ref", "delay", "argv", `${dashboardOpenScript}; return run(argv);`);
      return JSON.parse(script({ import: vi.fn(), unwrap: (value: unknown) => value, castRefToObject: (value: object) => references.get(value) }, bridge, () => scripting, () => [], () => {}, [JSON.stringify(browser), url]));
    },
  };
}

describe("default-browser dashboard navigation", () => {
  it.skipIf(process.platform !== "darwin")("converts native Core Foundation strings and arrays before tab inspection", async () => {
    const helpers = dashboardOpenScript.slice(dashboardOpenScript.indexOf("  function textAttribute"), dashboardOpenScript.indexOf("  function inspect"));
    const script = `
      ObjC.import("Foundation");
      ObjC.import("CoreFoundation");
      function attribute(element, name) { return element; }
      ${helpers}
      var label = $.CFStringCreateWithCString(null, "AI AI Captain — Session Monitor", $.kCFStringEncodingUTF8);
      var children = $.CFArrayCreateMutable(null, 0, null);
      $.CFArrayAppendValue(children, label);
      JSON.stringify({ label: textAttribute(label, "AXTitle"), count: list(children).length });
    `;
    const result = await promisify(execFile)("/usr/bin/osascript", ["-l", "JavaScript", "-e", script], { timeout: 8000 });
    expect(JSON.parse(result.stdout)).toEqual({ label: "AI AI Captain — Session Monitor", count: 1 });
  });

  it("normalizes dashboard URLs and refuses non-web schemes or embedded credentials", () => {
    expect(canonicalDashboardUrl(`${target}?filter=waiting#details`)).toBe(target);
    for (const value of ["file:///tmp/test", "javascript:alert(1)", "https://user:pass@example.com/"]) expect(() => canonicalDashboardUrl(value)).toThrow();
    expect(() => new Function(browserDetectionScript)).not.toThrow();
  });

  it("selects an existing Chromium tab by URL and raises its window instead of opening a duplicate", () => {
    const matchingTab = { url: () => `${target}#details` };
    const window = { tabs: () => [{ url: () => "https://example.com/" }, matchingTab], activeTabIndex: 1, index: 3, minimized: true };
    const harness = scriptHarness({ windows: [window] });
    expect(harness.run(chrome)).toMatchObject({ opened: true, reused: true });
    expect(window.activeTabIndex).toBe(2);
    expect(window.index).toBe(1);
    expect(window.minimized).toBe(false);
    expect(harness.activated).toHaveBeenCalledOnce();
    expect(harness.opened).not.toHaveBeenCalled();
  });

  it("adapts Safari's current-tab API and opens only when no matching tab exists", () => {
    const tab = { url: () => target.slice(0, -1) };
    const window = { tabs: () => [tab], currentTab: undefined as unknown, index: 4, miniaturized: true };
    const safari: DashboardBrowser = { id: "com.apple.Safari", name: "Safari", adapter: "safari", accessibilityTrusted: false };
    const harness = scriptHarness({ windows: [window] });
    expect(harness.run(safari)).toMatchObject({ opened: true, reused: true });
    expect(window.currentTab).toBe(tab);
    expect(window.miniaturized).toBe(false);
    const empty = scriptHarness({ windows: [] });
    expect(empty.run(safari)).toMatchObject({ opened: true, reused: false });
    expect(empty.opened).toHaveBeenCalledExactlyOnceWith(target);
  });

  it("selects an inactive Zen tab and verifies the native address bar without reading webpage contents", () => {
    const harness = scriptHarness();
    const tab = element("AXRadioButton", { AXTitle: "AI AI Captain — Session Monitor\nClose tab" });
    tab.url = target;
    const web = element("AXWebArea", {}, [element("AXTextField", { AXValue: target })]);
    const window = element("AXWindow", {}, [element("AXToolbar", {}, [element("AXTabGroup", {}, [tab]), harness.address]), web]);
    const configured = scriptHarness({ nativeWindows: [window] });
    window.children[0].children[1] = configured.address;
    expect(configured.run()).toMatchObject({ opened: true, reused: true });
    expect(configured.pressed).toHaveBeenCalledWith(tab, "AXPress");
    expect(configured.opened).not.toHaveBeenCalled();
    expect(configured.inspected.mock.calls.some(([entry, attribute]) => entry === web && attribute === "AXChildren")).toBe(false);
  });

  it("does not create duplicate tabs when permissions are denied, a browser is unsupported, or inspection fails", () => {
    const denied = scriptHarness({ trusted: false });
    expect(denied.run()).toMatchObject({ opened: false, reason: expect.stringContaining("Accessibility") });
    expect(denied.opened).not.toHaveBeenCalled();
    const unsupported = scriptHarness();
    expect(unsupported.run({ ...zen, adapter: "unsupported" })).toMatchObject({ opened: false });
    expect(unsupported.opened).not.toHaveBeenCalled();
    const failed = scriptHarness({ windows: [{ tabs: () => { throw new Error("Not authorized"); } }] });
    expect(failed.run(chrome)).toMatchObject({ opened: false, reason: expect.stringContaining("Automation") });
    expect(failed.opened).not.toHaveBeenCalled();
  });

  it("does not reuse a different hub's named tab or mistake webpage fields for the browser address bar", () => {
    const tab = element("AXRadioButton", { AXTitle: "AI AI Captain — Session Monitor" });
    tab.url = "http://127.0.0.1:9999/";
    const harness = scriptHarness();
    const window = element("AXWindow", {}, [element("AXToolbar", {}, [tab, harness.address]), element("AXWebArea", {}, [element("AXTextField", { AXValue: target })])]);
    const configured = scriptHarness({ nativeWindows: [window] });
    window.children[0].children[1] = configured.address;
    expect(configured.run()).toMatchObject({ opened: true, reused: false });
    expect(configured.opened).toHaveBeenCalledOnce();
  });

  it("detects the current default on each request and passes URLs as arguments rather than executable script text", async () => {
    const run = vi.fn().mockResolvedValueOnce(JSON.stringify(chrome)).mockResolvedValueOnce('{"opened":true,"reused":true}')
      .mockResolvedValueOnce(JSON.stringify(zen)).mockResolvedValueOnce('{"opened":true,"reused":false}');
    const controller = createDashboardController({ platform: "darwin", run });
    expect(await controller.open(target)).toMatchObject({ opened: true, reused: true, browser: chrome });
    expect(await controller.open(target)).toMatchObject({ opened: true, reused: false, browser: zen });
    expect(run.mock.calls[0][1]).toEqual(["-l", "JavaScript", "-e", browserDetectionScript, "--", target]);
    expect(run.mock.calls[1][1]).toEqual(["-l", "JavaScript", "-e", dashboardOpenScript, "--", JSON.stringify(chrome), target]);
  });

  it("coalesces rapid INFO presses including the new-tab fallback", async () => {
    let release!: (value: string) => void;
    const run = vi.fn().mockResolvedValueOnce(JSON.stringify(zen)).mockImplementationOnce(() => new Promise<string>((resolve) => { release = resolve; }))
      .mockResolvedValueOnce("");
    const controller = createDashboardController({ platform: "darwin", run });
    const first = controller.open(target);
    const second = controller.open(target);
    expect(first).toBe(second);
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    release('{"opened":false,"reason":"Accessibility permission required"}');
    expect(await first).toMatchObject({ opened: true, reused: false, reason: "Accessibility permission required" });
    expect(run).toHaveBeenLastCalledWith("/usr/bin/open", [target]);
    const failed = createDashboardController({ platform: "darwin", run: vi.fn().mockRejectedValue(new Error("Unavailable")) });
    expect(await failed.open(target)).toMatchObject({ opened: false });
    const unsupported = createDashboardController({ platform: "linux", run });
    expect(await unsupported.open(target)).toMatchObject({ opened: false });
    expect(run).toHaveBeenCalledTimes(3);
  });

  it.each(["permission", "unsupported", "inspection", "timeout", "detection", "invalid output"])("opens a new tab when reuse fails: %s", async (failure) => {
    const run = vi.fn();
    if (failure === "detection") run.mockRejectedValueOnce(new Error("Detection failed"));
    else {
      run.mockResolvedValueOnce(JSON.stringify(zen));
      if (failure === "timeout") run.mockRejectedValueOnce(new Error("Timeout"));
      else run.mockResolvedValueOnce(failure === "invalid output" ? "invalid" : JSON.stringify({ opened: false, reason: failure }));
    }
    run.mockResolvedValueOnce("");
    const controller = createDashboardController({ platform: "darwin", run });
    expect(await controller.open(target)).toMatchObject({ opened: true, reused: false });
    expect(run).toHaveBeenLastCalledWith("/usr/bin/open", [target]);
  });

  it("does not open invalid dashboard addresses through the fallback", async () => {
    const run = vi.fn();
    const controller = createDashboardController({ platform: "darwin", run });
    expect(await controller.open("file:///tmp/test")).toMatchObject({ opened: false });
    expect(run).not.toHaveBeenCalled();
  });
});

describe("dashboard navigation API", () => {
  const apps: ReturnType<typeof createApp>[] = [];
  afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

  it("uses only its configured dashboard URL, ignoring request bodies and untrusted Host headers", async () => {
    const dashboard = { getBrowser: vi.fn(async () => zen), open: vi.fn(async () => ({ opened: true, reused: true, browser: zen })) };
    const app = createApp({ dashboard, dashboardUrl: "http://127.0.0.1:54321/", webRoot: "/no-static-assets" });
    apps.push(app);
    expect((await app.inject({ method: "GET", url: "/api/dashboard/browser" })).json()).toEqual({ browser: zen });
    const response = await app.inject({ method: "POST", url: "/api/dashboard/open", headers: { host: "evil.invalid" }, payload: { url: "https://evil.invalid/" } });
    expect(response.json()).toMatchObject({ opened: true, reused: true });
    expect(dashboard.open).toHaveBeenCalledExactlyOnceWith("http://127.0.0.1:54321/");
    expect((await app.inject({ method: "POST", url: "/api/dashboard/open", headers: { origin: "https://evil.invalid" } })).statusCode).toBe(403);
    expect(dashboard.open).toHaveBeenCalledOnce();
  });
});
