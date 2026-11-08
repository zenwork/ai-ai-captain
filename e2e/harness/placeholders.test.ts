import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveInsideDirectory, resolvePlaceholders, type PlaceholderLookup } from "./placeholders.js";

const lookup: PlaceholderLookup = (name, agentKey) => {
  const values: Record<string, string | number> = { PID: 4242, T: 1_700_000_000_000, SESSION: `session-${agentKey ?? "default"}`, CLAUDE_HOME: "/tmp/claude" };
  if (!(name in values)) throw new Error(`unknown ${name}`);
  return values[name];
};

describe("placeholders", () => {
  it("keeps the number type when a value is only {PID} or {T}", () => {
    expect(resolvePlaceholders({ pid: "{PID}", startedAt: "{T}" }, lookup)).toEqual({ pid: 4242, startedAt: 1_700_000_000_000 });
  });

  it("replaces placeholders inside a longer text", () => {
    expect(resolvePlaceholders("{CLAUDE_HOME}/sessions/{PID}.json", lookup)).toBe("/tmp/claude/sessions/4242.json");
  });

  it("uses the agent key after the colon", () => {
    expect(resolvePlaceholders("claude:{SESSION:cli}", lookup)).toBe("claude:session-cli");
  });

  it("replaces placeholders in lists and nested objects", () => {
    expect(resolvePlaceholders({ list: ["{PID}"], nested: { text: "a{PID}" } }, lookup)).toEqual({ list: [4242], nested: { text: "a4242" } });
  });

  it("stops at a placeholder that is not known", () => {
    expect(() => resolvePlaceholders("{NOPE}", lookup)).toThrow(/unknown NOPE/);
  });
});

describe("paths from a recording", () => {
  it("accepts a path inside the temporary folder", () => {
    // The result uses the path separator of the operating system.
    expect(resolveInsideDirectory("/tmp/run", "/tmp/run/claude/sessions/1.json")).toBe(resolve("/tmp/run/claude/sessions/1.json"));
  });

  it("rejects a path that leaves the temporary folder", () => {
    expect(() => resolveInsideDirectory("/tmp/run", "/tmp/run/../outside.json")).toThrow(/outside the temporary folder/);
    expect(() => resolveInsideDirectory("/tmp/run", "/etc/passwd")).toThrow(/outside the temporary folder/);
  });
});
