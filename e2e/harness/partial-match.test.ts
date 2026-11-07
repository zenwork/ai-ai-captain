import { describe, expect, it } from "vitest";
import { findDifference } from "./partial-match.js";

describe("partial match", () => {
  it("accepts a value that has the expected fields and more", () => {
    expect(findDifference({ state: "working", model: "x" }, { state: "working" })).toBeUndefined();
  });

  it("names the first field that is different", () => {
    expect(findDifference({ state: "working" }, { state: "done" })).toBe('session.state is "working" but must be "done"');
  });

  it("reaches into nested objects", () => {
    expect(findDifference({ metadata: { host: "Terminal" } }, { metadata: { host: "Konsole" } })).toMatch(/session\.metadata\.host/);
  });

  it("supports matchers of Vitest", () => {
    const matchingMatcher: unknown = expect.objectContaining({ a: "1" });
    const failingMatcher: unknown = expect.objectContaining({ a: "2" });
    expect(findDifference({ metadata: { a: "1", b: "2" } }, { metadata: matchingMatcher })).toBeUndefined();
    expect(findDifference({ metadata: { a: "1" } }, { metadata: failingMatcher })).toMatch(/matcher/);
  });

  it("treats a missing field as different from an expected value", () => {
    expect(findDifference({}, { state: "done" })).toMatch(/undefined/);
  });
});
