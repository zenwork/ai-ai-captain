import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFocusHandler, type FocusResult } from "./focus.js";
import { focusTargetSchema } from "../shared/session.js";

const directories: string[] = [];
const application = "/Applications/IntelliJ IDEA 2026.2.app";
const target = { appName: "IntelliJ IDEA", appPath: application, pid: 123 };

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function projects(): Promise<string[]> {
  const root = await mkdtemp(join(tmpdir(), "ai-ai-captain-focus-"));
  directories.push(root);
  const paths = [join(root, "first project"), join(root, 'second "quoted" project')];
  for (const path of paths) await mkdir(path);
  return Promise.all(paths.map((path) => realpath(path)));
}

function successfulRunner() {
  return vi.fn<(command: string, args: string[]) => Promise<FocusResult>>(async () => ({ focused: true }));
}

describe("project-aware focus", () => {
  it("opens the exact Claude desktop chat through its restricted conversation link", async () => {
    const run = successfulRunner();
    const focus = createFocusHandler({ platform: "darwin", run });
    const identifier = "6ef2c5c7-a520-49a1-b6fb-5b3831863a22";
    expect(await focus({ appName: "Claude", claudeConversationId: identifier })).toEqual({ focused: true, scope: "session" });
    expect(run).toHaveBeenCalledExactlyOnceWith("/usr/bin/open", [`claude://claude.ai/chat/${identifier}`]);
    expect(focusTargetSchema.safeParse({ claudeConversationId: "../../new?q=private" }).success).toBe(false);
    expect((await focus({ claudeConversationId: "../../new?q=private" })).focused).toBe(false);
    expect(run).toHaveBeenCalledTimes(1);
  });
  it("presses a Claude desktop sidebar row and falls back to application focus", async () => {
    const run = successfulRunner();
    const focus = createFocusHandler({ platform: "darwin", run });
    const row = { appName: "Claude", bundleId: "com.anthropic.claudefordesktop", pid: 42, claudeRowKey: "0123456789abcdef" };
    expect(await focus(row)).toEqual({ focused: true, scope: "session" });
    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0][0]).toBe("/usr/bin/osascript");
    expect(run.mock.calls[0][1].slice(0, 2)).toEqual(["-l", "JavaScript"]);
    expect(run.mock.calls[0][1].slice(-3)).toEqual(["--", "42", "0123456789abcdef"]);
    run.mockResolvedValueOnce({ focused: false, reason: "not found" });
    expect(await focus(row)).toEqual({ focused: true, scope: "application" });
    expect(run).toHaveBeenLastCalledWith("/usr/bin/osascript", ["-e", 'tell application id "com.anthropic.claudefordesktop" to activate']);
    expect(focusTargetSchema.safeParse({ claudeRowKey: "Ping; rm -rf" }).success).toBe(false);
  });

  it("activates an application by bundle identifier when no application path is set", async () => {
    const run = successfulRunner();
    const focus = createFocusHandler({ platform: "darwin", run });
    expect(await focus({ appName: "Microsoft Copilot", bundleId: "com.microsoft.m365copilot" })).toEqual({ focused: true, scope: "application" });
    expect(run).toHaveBeenCalledWith("/usr/bin/osascript", ["-e", 'tell application id "com.microsoft.m365copilot" to activate']);
  });

  it("activates an application by path when set", async () => {
    const run = successfulRunner();
    const focus = createFocusHandler({ platform: "darwin", run });
    expect(await focus({ appName: "Copilot", appPath: "/Applications/Microsoft Copilot.app", bundleId: "com.microsoft.m365copilot" })).toEqual({
      focused: true,
      scope: "application",
    });
    expect(run).toHaveBeenCalledWith("/usr/bin/osascript", ["-e", 'tell application "/Applications/Microsoft Copilot.app" to activate']);
  });

  it("does not press Claude rows on other systems", async () => {
    const run = successfulRunner();
    const focus = createFocusHandler({ platform: "win32", run });
    await focus({ appName: "Claude", pid: 42, claudeRowKey: "0123456789abcdef" });
    expect(run.mock.calls.every(([command]) => command !== "/usr/bin/osascript")).toBe(true);
  });

  it.skipIf(process.platform === "win32")("passes each project to the owning launcher before PID-only activation", async () => {
    const paths = await projects();
    const run = successfulRunner();
    const focus = createFocusHandler({ platform: "darwin", preciseFocus: true, run });
    expect(await focus(target, paths[0])).toEqual({ focused: true, scope: "project" });
    expect(await focus(target, paths[1])).toEqual({ focused: true, scope: "project" });
    expect(run.mock.calls).toEqual([
      [join(application, "Contents", "MacOS", "idea"), [paths[0]]],
      [join(application, "Contents", "MacOS", "idea"), [paths[1]]],
    ]);
  });

  it.skipIf(process.platform === "win32")("uses a bundle ID when an exact application path was not reported", async () => {
    const [project] = await projects();
    const run = successfulRunner();
    const focus = createFocusHandler({ platform: "darwin", preciseFocus: false, run });
    await focus({ appName: "IntelliJ IDEA", bundleId: "com.jetbrains.intellij" }, project);
    expect(run).toHaveBeenCalledWith("/usr/bin/open", ["-n", "-b", "com.jetbrains.intellij", "--args", project]);
  });

  it.skipIf(process.platform === "win32")("uses the named IntelliJ launcher for bridge sessions without installation metadata", async () => {
    const [project] = await projects();
    const run = successfulRunner();
    const focus = createFocusHandler({ platform: "darwin", run });
    expect(await focus({ appName: "IntelliJ IDEA" }, project)).toEqual({ focused: true, scope: "project" });
    expect(run).toHaveBeenCalledWith("/usr/bin/open", ["-n", "-a", "IntelliJ IDEA", "--args", project]);
  });

  it("rejects unavailable or relative project paths instead of reporting an app-only success", async () => {
    const run = successfulRunner();
    const focus = createFocusHandler({ platform: "darwin", run });
    expect((await focus(target, "relative/project")).focused).toBe(false);
    expect((await focus(target, "/missing-ai-ai-captain-test-project")).focused).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it.skipIf(process.platform === "win32")("returns a project failure without falling back to activating every IDEA window", async () => {
    const [project] = await projects();
    const run = vi.fn<(command: string, args: string[]) => Promise<FocusResult>>(async () => ({ focused: false, reason: "Command failed" }));
    const focus = createFocusHandler({ platform: "darwin", run });
    expect((await focus(target, project)).focused).toBe(false);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it.skipIf(process.platform === "win32")("keeps non-IDE targets at application scope even when a session has a working directory", async () => {
    const [project] = await projects();
    const run = successfulRunner();
    const focus = createFocusHandler({ platform: "darwin", preciseFocus: false, run });
    expect(await focus({ appName: "Terminal" }, project)).toEqual({ focused: true, scope: "application" });
    expect(run).toHaveBeenCalledWith("/usr/bin/osascript", ["-e", 'tell application "Terminal" to activate']);
  });

  it("accepts only absolute app bundle paths from reporters", () => {
    expect(focusTargetSchema.safeParse(target).success).toBe(true);
    expect(focusTargetSchema.safeParse({ appPath: "relative/IDE.app" }).success).toBe(false);
    expect(focusTargetSchema.safeParse({ appPath: "/tmp/executable" }).success).toBe(false);
  });
});

describe("focus on Linux and Windows", () => {
  it("activates the window of a process with xdotool on Linux", async () => {
    const run = successfulRunner();
    const focus = createFocusHandler({ platform: "linux", run });
    expect(await focus({ appName: "GNOME Terminal", pid: 42 })).toEqual({ focused: true, scope: "application" });
    expect(run).toHaveBeenCalledWith("xdotool", ["search", "--pid", "42", "windowactivate"]);
  });

  it("activates the window of a process with PowerShell on Windows", async () => {
    const run = successfulRunner();
    const focus = createFocusHandler({ platform: "win32", run });
    expect(await focus({ appName: "Windows Terminal", pid: 42 })).toEqual({ focused: true, scope: "application" });
    expect(run.mock.calls[0][0]).toBe("powershell.exe");
    expect(run.mock.calls[0][1].join(" ")).toContain("AppActivate(42)");
  });

  it("opens the Claude chat link with xdg-open on Linux", async () => {
    const run = successfulRunner();
    const focus = createFocusHandler({ platform: "linux", run });
    const result = await focus({ claudeConversationId: "6ef2c5c7-a520-49a1-b6fb-5b3831863a22" });
    expect(result).toEqual({ focused: true, scope: "session" });
    expect(run.mock.calls[0][0]).toBe("xdg-open");
  });

  it("reports a safe reason when no window can be focused", async () => {
    const run = vi.fn(async (): Promise<FocusResult> => ({ focused: false, reason: "failed" }));
    const focus = createFocusHandler({ platform: "linux", run });
    const result = await focus({ appName: "Terminal" });
    expect(result.focused).toBe(false);
  });
});

describe("focus dry run", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("writes the focus command to the log file and does not run it", async () => {
    const directory = await mkdtemp(join(tmpdir(), "focus-log-"));
    const logPath = join(directory, "focus.log");
    vi.stubEnv("AI_AI_CAPTAIN_FOCUS_LOG", logPath);
    try {
      const result = await createFocusHandler({ platform: "darwin" })({ pid: 10, appName: "Terminal" });
      expect(result).toEqual({ focused: true, scope: "application" });
      const lines = (await readFile(logPath, "utf8")).trim().split("\n");
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0])).toMatchObject({ command: "/usr/bin/osascript" });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
