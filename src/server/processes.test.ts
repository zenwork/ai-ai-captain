import { describe, expect, it } from "vitest";
import { hostApplication, listOpenFiles, listProcesses, parseWindowsProcesses, type ProcessInfo } from "./processes.js";

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

describe("Windows and Linux support", () => {
  it("parses the PowerShell process list and normalizes the names", () => {
    const output = JSON.stringify([
      { pid: 5, parentPid: 1, name: "C:\\Tools\\codex.exe", startedAt: "2026-10-31T10:00:00.0000000Z" },
      { pid: 6, parentPid: 5, name: "cmd.exe", startedAt: null },
    ]);
    const processes = parseWindowsProcesses(output);
    expect(processes[0]).toEqual({ pid: 5, parentPid: 1, name: "C:/Tools/codex", startedAt: "2026-10-31T10:00:00.0000000Z" });
    expect(processes[1]).toEqual({ pid: 6, parentPid: 5, name: "cmd" });
  });

  it("accepts one process as a single JSON object", () => {
    const output = JSON.stringify({ pid: 5, parentPid: 1, name: "a.exe" });
    expect(parseWindowsProcesses(output)).toHaveLength(1);
    expect(parseWindowsProcesses("")).toEqual([]);
  });

  it("finds a known terminal program above a process on Linux", () => {
    const processes: ProcessInfo[] = [
      { pid: 10, parentPid: 1, name: "gnome-terminal-server" },
      { pid: 11, parentPid: 10, name: "bash" },
      { pid: 12, parentPid: 11, name: "codex" },
    ];
    expect(hostApplication(12, processes, "linux")).toEqual({ pid: 10, appName: "GNOME Terminal" });
    expect(hostApplication(11, [{ pid: 11, parentPid: 1, name: "bash" }], "linux")).toBeUndefined();
  });

  it("finds Windows Terminal from a normalized name", () => {
    const processes: ProcessInfo[] = [
      { pid: 10, parentPid: 1, name: "C:/Program Files/WindowsApps/WindowsTerminal" },
      { pid: 11, parentPid: 10, name: "C:/Tools/codex" },
    ];
    expect(hostApplication(11, processes, "win32")).toEqual({ pid: 10, appName: "Windows Terminal" });
  });

  it("returns no open files on Windows", async () => {
    expect(await listOpenFiles([1], undefined, "win32")).toBe("");
  });
});

describe("process list smoke test", () => {
  it("lists the current process on the real operating system", async () => {
    const processes = await listProcesses();
    const currentProcess = processes.find((entry) => entry.pid === process.pid);
    expect(processes.length).toBeGreaterThan(0);
    expect(currentProcess).toBeDefined();
  });
});
