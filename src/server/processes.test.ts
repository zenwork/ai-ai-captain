import { describe, expect, it } from "vitest";
import { hostApplication, type ProcessInfo } from "./processes.js";

describe("host application lookup", () => {
  it("uses the outermost app bundle instead of a nested helper app", () => {
    const processes: ProcessInfo[] = [
      { pid: 20, parentPid: 1, name: "/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/CodexCLI" },
    ];
    expect(hostApplication(20, processes)).toEqual({ pid: 20, appName: "ChatGPT", appPath: "/Applications/ChatGPT.app" });
  });

  it("finds the app of a parent process", () => {
    const processes: ProcessInfo[] = [
      { pid: 10, parentPid: 1, name: "/System/Applications/Utilities/Terminal.app/Contents/MacOS/Terminal" },
      { pid: 11, parentPid: 10, name: "/bin/zsh" },
    ];
    expect(hostApplication(11, processes)).toEqual({ pid: 10, appName: "Terminal", appPath: "/System/Applications/Utilities/Terminal.app" });
  });
});
