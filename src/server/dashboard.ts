import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";

export interface DashboardBrowser {
  id: string;
  name: string;
  adapter: "chromium" | "safari" | "accessibility" | "unsupported";
  accessibilityTrusted: boolean;
}

export interface DashboardResult {
  opened: boolean;
  reused?: boolean;
  browser?: DashboardBrowser;
  reason?: string;
}

type Runner = (command: string, args: string[]) => Promise<string>;
const execute = promisify(execFile);
const browserSchema = z.object({
  id: z.string(),
  name: z.string(),
  adapter: z.enum(["chromium", "safari", "accessibility", "unsupported"]),
  accessibilityTrusted: z.boolean(),
});
const openResultSchema = z.object({
  opened: z.boolean(),
  reused: z.boolean().optional(),
  reason: z.string().optional(),
}).refine((result) => !result.opened || result.reused !== undefined);

export function canonicalDashboardUrl(value: string): string {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Dashboard URLs must use HTTP or HTTPS without credentials");
  url.search = "";
  url.hash = "";
  return url.href;
}

export const browserDetectionScript = String.raw`
ObjC.import("AppKit");
ObjC.import("ApplicationServices");
function run(argv) {
  var location = $.NSWorkspace.sharedWorkspace.URLForApplicationToOpenURL($.NSURL.URLWithString(argv[0]));
  if (!location) throw new Error("No default web browser is configured");
  var bundle = $.NSBundle.bundleWithURL(location);
  var identifier = ObjC.unwrap(bundle.bundleIdentifier);
  var name = ObjC.unwrap(bundle.objectForInfoDictionaryKey("CFBundleDisplayName")) || ObjC.unwrap(bundle.objectForInfoDictionaryKey("CFBundleName")) || identifier;
  var chromium = /^(com\.google\.Chrome(?:\..+)?|org\.chromium\.Chromium|com\.microsoft\.edgemac(?:\..+)?|com\.brave\.Browser(?:\..+)?|com\.vivaldi\.Vivaldi)$/i;
  var adapter = chromium.test(identifier) ? "chromium" : /^com\.apple\.Safari(?:TechnologyPreview)?$/.test(identifier) ? "safari" : /^(app\.zen-browser\.zen|org\.mozilla\.(firefox|firefoxdeveloperedition|nightly))$/i.test(identifier) ? "accessibility" : "unsupported";
  return JSON.stringify({ id: identifier, name: name, adapter: adapter, accessibilityTrusted: Boolean($.AXIsProcessTrusted()) });
}`;

export const dashboardOpenScript = String.raw`
ObjC.import("AppKit");
ObjC.import("ApplicationServices");
function run(argv) {
  var browser = JSON.parse(argv[0]);
  var target = argv[1];
  var title = "AI AI Captain — Session Monitor";
  function matches(value) {
    return typeof value === "string" && value.split(/[?#]/)[0].replace(/\/$/, "") === target.replace(/\/$/, "");
  }
  function result(opened, reused, reason) {
    return JSON.stringify({ opened: opened, reused: reused, reason: reason });
  }
  function openNew() {
    var opened = Boolean($.NSWorkspace.sharedWorkspace.openURL($.NSURL.URLWithString(target)));
    return result(opened, false, opened ? undefined : "The default browser could not open the dashboard");
  }
  if (browser.adapter === "unsupported") return result(false, false, "Tab reuse is not supported for " + browser.name);
  var applications = $.NSRunningApplication.runningApplicationsWithBundleIdentifier(browser.id);
  if (applications.count === 0) return openNew();
  if (browser.adapter === "chromium" || browser.adapter === "safari") {
    try {
      var application = Application(browser.id);
      var windows = application.windows();
      for (var windowIndex = 0; windowIndex < windows.length; windowIndex++) {
        var tabs = windows[windowIndex].tabs();
        for (var tabIndex = 0; tabIndex < tabs.length; tabIndex++) {
          if (!matches(tabs[tabIndex].url())) continue;
          if (browser.adapter === "safari") {
            windows[windowIndex].currentTab = tabs[tabIndex];
            windows[windowIndex].miniaturized = false;
          } else {
            windows[windowIndex].activeTabIndex = tabIndex + 1;
            windows[windowIndex].minimized = false;
          }
          windows[windowIndex].index = 1;
          application.activate();
          return result(true, true);
        }
      }
      return openNew();
    } catch (error) {
      return result(false, false, "Tab reuse needs Automation access for " + browser.name + ". Check System Settings → Privacy & Security → Automation.");
    }
  }
  if (!$.AXIsProcessTrusted()) return result(false, false, "Tab reuse needs Accessibility access for the application that runs the hub. Check System Settings → Privacy & Security → Accessibility.");
  function attribute(element, name) {
    var output = Ref();
    var status = $.AXUIElementCopyAttributeValue(element, $(name), output);
    if (status === -25205 || status === -25212) return null;
    if (status !== 0) throw new Error("Browser accessibility inspection failed");
    return output[0];
  }
  function textAttribute(element, name) {
    var value = attribute(element, name);
    return value ? ObjC.unwrap(ObjC.castRefToObject(value)) : "";
  }
  function list(value) {
    var entries = [];
    if (!value) return entries;
    var array = ObjC.castRefToObject(value);
    for (var index = 0; index < array.count; index++) entries.push(array.objectAtIndex(index));
    return entries;
  }
  function inspect(window) {
    var pending = [window];
    var count = 0;
    var tabs = [];
    var addresses = [];
    var selected;
    while (pending.length && count++ < 2000) {
      var element = pending.pop();
      var role = textAttribute(element, "AXRole");
      if (["AXWebArea", "AXMenu", "AXMenuBar"].indexOf(role) !== -1) continue;
      if (["AXRadioButton", "AXTab", "AXButton"].indexOf(role) !== -1) {
        var label = textAttribute(element, "AXTitle") || textAttribute(element, "AXDescription");
        if (typeof label === "string" && label.split(/\r?\n/)[0] === title) tabs.push(element);
        if (role !== "AXButton" && (textAttribute(element, "AXValue") === 1 || textAttribute(element, "AXSelected") === true)) selected = element;
      }
      if (role === "AXComboBox" || role === "AXTextField") {
        var value = textAttribute(element, "AXValue");
        if (typeof value === "string" && /^https?:\/\//.test(value)) addresses.push(value);
      }
      pending = pending.concat(list(attribute(element, "AXChildren")));
    }
    if (pending.length) throw new Error("Browser tab inspection limit reached");
    return { tabs: tabs, addresses: addresses, selected: selected };
  }
  function activate(application, window) {
    if (textAttribute(window, "AXMinimized") === true && $.AXUIElementSetAttributeValue(window, $("AXMinimized"), $.kCFBooleanFalse) !== 0) throw new Error("Browser window could not be restored");
    if ($.AXUIElementPerformAction(window, $("AXRaise")) !== 0) throw new Error("Browser window could not be raised");
    if (!application.activateWithOptions($.NSApplicationActivateIgnoringOtherApps)) throw new Error("Browser could not be activated");
    return result(true, true);
  }
  try {
    for (var applicationIndex = 0; applicationIndex < applications.count; applicationIndex++) {
      var nativeApplication = applications.objectAtIndex(applicationIndex);
      var root = $.AXUIElementCreateApplication(nativeApplication.processIdentifier);
      $.AXUIElementSetMessagingTimeout(root, 1);
      var browserWindows = list(attribute(root, "AXWindows"));
      for (var browserWindowIndex = 0; browserWindowIndex < browserWindows.length; browserWindowIndex++) {
        var window = browserWindows[browserWindowIndex];
        var snapshot = inspect(window);
        if (snapshot.addresses.some(matches)) return activate(nativeApplication, window);
        for (var candidateIndex = 0; candidateIndex < snapshot.tabs.length; candidateIndex++) {
          if ($.AXUIElementPerformAction(snapshot.tabs[candidateIndex], $("AXPress")) !== 0) throw new Error("Browser tab could not be selected");
          var verified = false;
          for (var attempt = 0; attempt < 4; attempt++) {
            var current = inspect(window);
            if (current.addresses.some(matches)) return activate(nativeApplication, window);
            verified = current.addresses.length > 0;
            delay(0.1);
          }
          if (snapshot.selected) $.AXUIElementPerformAction(snapshot.selected, $("AXPress"));
          if (!verified) throw new Error("Dashboard tab URL could not be verified");
        }
      }
    }
    return openNew();
  } catch (error) {
    return result(false, false, "Tab reuse failed in " + browser.name + ". Check macOS Accessibility access for the application that runs the hub.");
  }
}`;

export function createDashboardController(options: { platform?: NodeJS.Platform; run?: Runner } = {}) {
  const platform = options.platform ?? process.platform;
  const run = options.run ?? (async (command, args) => (await execute(command, args, { timeout: 8000, maxBuffer: 64 * 1024 })).stdout);
  let inFlight: Promise<DashboardResult> | undefined;

  async function getBrowser(url: string): Promise<DashboardBrowser> {
    if (platform !== "darwin") throw new Error("Automatic browser tab reuse is supported on macOS only");
    const output = await run("/usr/bin/osascript", ["-l", "JavaScript", "-e", browserDetectionScript, "--", canonicalDashboardUrl(url)]);
    return browserSchema.parse(JSON.parse(output));
  }

  async function performOpen(url: string): Promise<DashboardResult> {
    if (platform !== "darwin") return { opened: false, reason: "Automatic browser tab reuse is supported on macOS only" };
    let target: string;
    try {
      target = canonicalDashboardUrl(url);
    } catch {
      return { opened: false, reason: "The dashboard address is not valid" };
    }
    let browser: DashboardBrowser | undefined;
    let reason = "Dashboard tab reuse failed. Check macOS Automation or Accessibility access for the application that runs the hub.";
    try {
      browser = await getBrowser(target);
      const output = await run("/usr/bin/osascript", ["-l", "JavaScript", "-e", dashboardOpenScript, "--", JSON.stringify(browser), target]);
      const result = openResultSchema.parse(JSON.parse(output));
      if (result.opened) return { opened: true, reused: result.reused, reason: result.reason, browser };
      reason = result.reason ?? reason;
    } catch {
      reason = "Dashboard tab reuse failed. Check macOS Automation or Accessibility access for the application that runs the hub.";
    }
    try {
      await run("/usr/bin/open", [target]);
      return { opened: true, reused: false, browser, reason };
    } catch {
      return { opened: false, browser, reason: "The default browser could not open the dashboard" };
    }
  }

  return {
    getBrowser,
    open(url: string): Promise<DashboardResult> {
      inFlight ??= performOpen(url).finally(() => { inFlight = undefined; });
      return inFlight;
    },
  };
}
