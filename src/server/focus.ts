import { execFile } from "node:child_process";
import { realpath, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { promisify } from "node:util";
import type { FocusTarget } from "./types.js";
import { focusTargetSchema } from "../shared/session.js";

export type FocusResult = { focused: true; scope?: "application" | "project" | "session" } | { focused: false; reason: string };
export type FocusHandler = (target: FocusTarget | undefined, projectPath?: string) => Promise<FocusResult>;
type CommandRunner = (command: string, args: string[]) => Promise<FocusResult>;

const execute = promisify(execFile);

function appleScriptString(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

async function runCommand(command: string, args: string[]): Promise<FocusResult> {
  try {
    await execute(command, args, { timeout: 5000, maxBuffer: 64 * 1024 });
    return { focused: true };
  } catch {
    return { focused: false, reason: "macOS could not complete the focus request" };
  }
}

export function createFocusHandler(options: { platform?: NodeJS.Platform; preciseFocus?: boolean; run?: CommandRunner } = {}): FocusHandler {
  const platform = options.platform ?? process.platform;
  const preciseFocus = options.preciseFocus ?? process.env.AI_AI_CAPTAIN_PRECISE_FOCUS === "1";
  const run = options.run ?? runCommand;
  const activate = async (script: string): Promise<FocusResult> => {
    const result = await run("/usr/bin/osascript", ["-e", script]);
    return result.focused ? { focused: true, scope: "application" } : result;
  };

  return async (target, projectPath) => {
    if (!target) return { focused: false, reason: "This session has no focus target" };
    const validated = focusTargetSchema.safeParse(target);
    if (!validated.success) return { focused: false, reason: "The focus target is not valid" };
    target = validated.data;
    if (platform !== "darwin") return { focused: false, reason: "Window focus is supported on macOS only" };
    if (target.claudeConversationId) {
      const result = await run("/usr/bin/open", [`claude://claude.ai/chat/${target.claudeConversationId}`]);
      return result.focused ? { focused: true, scope: "session" } : result;
    }
    const isIntelliJ = /intellij/i.test(`${target.appName ?? ""} ${target.appPath ?? ""} ${target.bundleId ?? ""}`);
    if (isIntelliJ && projectPath) {
      if (!isAbsolute(projectPath)) return { focused: false, reason: "The IntelliJ project path must be absolute" };
      const directory = await stat(projectPath).catch(() => undefined);
      if (!directory?.isDirectory()) return { focused: false, reason: "The IntelliJ project directory is no longer available" };
      const path = await realpath(projectPath).catch(() => projectPath);
      const application = target.appPath ?? target.bundleId ?? target.appName;
      if (!application) return { focused: false, reason: "The IntelliJ installation could not be identified" };
      const selector = target.appPath || !target.bundleId ? "-a" : "-b";
      const result = await run("/usr/bin/open", [selector, application, path]);
      return result.focused ? { focused: true, scope: "project" } : { focused: false, reason: "IntelliJ could not open or activate the session's project" };
    }
    let preciseResult: FocusResult | undefined;
    if (preciseFocus && target.pid) {
      preciseResult = await activate(`tell application "System Events" to set frontmost of first process whose unix id is ${target.pid} to true`);
      if (preciseResult.focused) return preciseResult;
    }
    if (target.appPath || target.appName) return activate(`tell application ${appleScriptString(target.appPath ?? target.appName!)} to activate`);
    if (target.bundleId) return activate(`tell application id ${appleScriptString(target.bundleId)} to activate`);
    if (target.url) return run("/usr/bin/open", [target.url]);
    return preciseResult ?? { focused: false, reason: "This session has no supported focus target" };
  };
}

export const focusTarget: FocusHandler = createFocusHandler();
