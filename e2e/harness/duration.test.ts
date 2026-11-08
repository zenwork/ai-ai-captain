import { describe, expect, it } from "vitest";
import { formatDurationMilliseconds, parseDurationMilliseconds } from "./duration.js";

describe("durations", () => {
  it("reads milliseconds, seconds, and minutes", () => {
    expect(parseDurationMilliseconds("150ms")).toBe(150);
    expect(parseDurationMilliseconds("2s")).toBe(2_000);
    expect(parseDurationMilliseconds("11m")).toBe(660_000);
    expect(parseDurationMilliseconds("1.5s")).toBe(1_500);
  });

  it("rejects a text without a unit", () => {
    expect(() => parseDurationMilliseconds("15")).toThrow(/not valid/);
  });

  it("writes whole seconds as seconds", () => {
    expect(formatDurationMilliseconds(8_000)).toBe("8s");
    expect(formatDurationMilliseconds(250)).toBe("250ms");
  });
});
