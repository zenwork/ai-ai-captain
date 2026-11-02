import { describe, expect, it } from "vitest";
import { findById } from "./card-design.js";

describe("findById", () => {
  const entries = [
    { id: "claude", title: "CLAUDE" },
    { id: "openai", title: "CODEX" },
  ] as const;

  it("returns the entry with the identifier", () => {
    expect(findById(entries, "openai", "budget provider")).toEqual({ id: "openai", title: "CODEX" });
  });

  it("throws with the list name when the identifier has no entry", () => {
    expect(() => findById(entries, "unknown", "budget provider")).toThrow('The budget provider list has no entry "unknown"');
  });
});
