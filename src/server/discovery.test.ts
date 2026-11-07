import { describe, expect, it } from "vitest";
import { discoverDesktopApps, matchesMainAppProcess } from "./discovery.js";
import { ClientRegistry } from "./clients.js";

describe("desktop app process matching", () => {
  it.skipIf(process.platform !== "darwin")("shows Claude tracking limits without creating a fake conversation", async () => {
    const clients = new ClientRegistry();
    const processes = [{ pid: 10, parentPid: 1, name: "/Applications/Claude.app/Contents/MacOS/Claude" }];
    await discoverDesktopApps(clients, processes, false, "permission-denied");
    expect(clients.list()[0].trackingDetails).toContain("Accessibility");
    await discoverDesktopApps(clients, processes, true, "available");
    expect(clients.list()).toEqual([]);
  });
  it("matches the main executable inside the expected app bundle", () => {
    expect(matchesMainAppProcess("/Applications/Copilot.app/Contents/MacOS/Copilot", "Copilot.app", "Copilot")).toBe(true);
  });

  it.skipIf(process.platform !== "darwin")("shows Copilot as an untracked app with its focus bundle and reason", async () => {
    const clients = new ClientRegistry();
    const processes = [{ pid: 12, parentPid: 1, name: "/Applications/Copilot.app/Contents/MacOS/Copilot" }];
    await discoverDesktopApps(clients, processes);
    expect(clients.list()).toEqual([
      {
        id: "desktop:copilot",
        name: "Copilot",
        focusTarget: { pid: 12, bundleId: "com.microsoft.m365copilot", appName: "Copilot", appPath: "/Applications/Copilot.app" },
        sessionTracking: "unavailable",
        trackingDetails: "No supported conversation ID or status source is exposed. Sidebar history links are not live sessions.",
      },
    ]);
  });

  it("does not mistake an IntelliJ Copilot plugin process for the Copilot app", () => {
    expect(
      matchesMainAppProcess(
        "/Users/example/Library/Application Support/JetBrains/IntelliJIdea2026.2/plugins/github-copilot-intellij/copilot-agent/native/darwin-arm64/copilot-language-server",
        "Copilot.app",
        "Copilot",
      ),
    ).toBe(false);
  });

  it("does not match app helper processes", () => {
    expect(
      matchesMainAppProcess(
        "/Applications/Copilot.app/Contents/Frameworks/Microsoft Edge Helper.app/Contents/MacOS/Microsoft Edge Helper",
        "Copilot.app",
        "Copilot",
      ),
    ).toBe(false);
  });
});
