import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, realpath, rm } from "node:fs/promises";
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
  return vi.fn(async (_command: string, _args: string[]): Promise<FocusResult> => ({ focused: true }));
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
  it("targets different projects in the same IDEA installation before PID-only activation", async () => {
    const paths = await projects();
    const run = successfulRunner();
    const focus = createFocusHandler({ platform: "darwin", preciseFocus: true, run });
    expect(await focus(target, paths[0])).toEqual({ focused: true, scope: "project" });
    expect(await focus(target, paths[1])).toEqual({ focused: true, scope: "project" });
    expect(run.mock.calls).toEqual([
      ["/usr/bin/open", ["-a", application, paths[0]]],
      ["/usr/bin/open", ["-a", application, paths[1]]],
    ]);
  });

  it("uses a bundle ID when an exact application path was not reported", async () => {
    const [project] = await projects();
    const run = successfulRunner();
    const focus = createFocusHandler({ platform: "darwin", preciseFocus: false, run });
    await focus({ appName: "IntelliJ IDEA", bundleId: "com.jetbrains.intellij" }, project);
    expect(run).toHaveBeenCalledWith("/usr/bin/open", ["-b", "com.jetbrains.intellij", project]);
  });

  it("uses the named IntelliJ launcher for bridge sessions without installation metadata", async () => {
    const [project] = await projects();
    const run = successfulRunner();
    const focus = createFocusHandler({ platform: "darwin", run });
    expect(await focus({ appName: "IntelliJ IDEA" }, project)).toEqual({ focused: true, scope: "project" });
    expect(run).toHaveBeenCalledWith("/usr/bin/open", ["-a", "IntelliJ IDEA", project]);
  });

  it("rejects unavailable or relative project paths instead of reporting an app-only success", async () => {
    const run = successfulRunner();
    const focus = createFocusHandler({ platform: "darwin", run });
    expect((await focus(target, "relative/project")).focused).toBe(false);
    expect((await focus(target, "/missing-ai-ai-captain-test-project")).focused).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it("returns a project failure without falling back to activating every IDEA window", async () => {
    const [project] = await projects();
    const run = vi.fn(async (_command: string, _args: string[]): Promise<FocusResult> => ({ focused: false, reason: "Command failed" }));
    const focus = createFocusHandler({ platform: "darwin", run });
    expect((await focus(target, project)).focused).toBe(false);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("keeps non-IDE targets at application scope even when a session has a working directory", async () => {
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
