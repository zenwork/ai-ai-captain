import { describe, expect, it } from "vitest";
import { readSandboxSettings } from "./sandbox.js";

describe("sandbox settings", () => {
  it("uses the normal values when no variable is set", () => {
    expect(readSandboxSettings({})).toEqual({ enabled: false, discoveryIntervalMilliseconds: 5_000 });
  });

  it("reads the sandbox flag, the scan interval, and the focus log path", () => {
    const settings = readSandboxSettings({
      AI_AI_CAPTAIN_SANDBOX: "1",
      AI_AI_CAPTAIN_DISCOVERY_INTERVAL_MILLISECONDS: "250",
      AI_AI_CAPTAIN_FOCUS_LOG: "/tmp/focus.log",
    });
    expect(settings).toEqual({ enabled: true, discoveryIntervalMilliseconds: 250, focusLogPath: "/tmp/focus.log" });
  });

  it("turns the sandbox on only for the value 1", () => {
    expect(readSandboxSettings({ AI_AI_CAPTAIN_SANDBOX: "true" }).enabled).toBe(false);
  });

  it("ignores an interval that is not valid or is too short", () => {
    expect(readSandboxSettings({ AI_AI_CAPTAIN_DISCOVERY_INTERVAL_MILLISECONDS: "abc" }).discoveryIntervalMilliseconds).toBe(5_000);
    expect(readSandboxSettings({ AI_AI_CAPTAIN_DISCOVERY_INTERVAL_MILLISECONDS: "10" }).discoveryIntervalMilliseconds).toBe(5_000);
  });

  it("does not let one invalid value change the other settings", () => {
    const settings = readSandboxSettings({ AI_AI_CAPTAIN_SANDBOX: "1", AI_AI_CAPTAIN_DISCOVERY_INTERVAL_MILLISECONDS: "abc" });
    expect(settings.enabled).toBe(true);
  });
});
