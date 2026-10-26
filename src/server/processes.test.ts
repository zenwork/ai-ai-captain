import { describe, expect, it } from "vitest";
import { parseProcesses } from "./processes.js";

describe("process inventory", () => {
  it("retains process start identity and application paths with spaces", () => {
    expect(parseProcesses(" 1857 1 Sun Oct 25 08:00:00 2026 /Applications/IntelliJ IDEA.app/Contents/MacOS/idea\n20 1857 Sun Oct  4 09:00:00 2026 /runtime/copilot-runtime\ninvalid\n")).toEqual([
      { pid: 1857, parentPid: 1, startedAt: new Date("Sun Oct 25 08:00:00 2026").toISOString(), name: "/Applications/IntelliJ IDEA.app/Contents/MacOS/idea" },
      { pid: 20, parentPid: 1857, startedAt: new Date("Sun Oct 4 09:00:00 2026").toISOString(), name: "/runtime/copilot-runtime" },
    ]);
  });
});
