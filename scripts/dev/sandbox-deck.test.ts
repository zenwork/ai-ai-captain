import { describe, expect, it } from "vitest";
import { sandboxDeckArguments } from "./sandbox-deck.js";

describe("sandbox deck arguments", () => {
  it("plays the life cycle scenario in a loop when no scenario is given", () => {
    expect(sandboxDeckArguments([])).toEqual(["--loop", "e2e/scenarios/claude-code-lifecycle.ts"]);
  });

  it("plays the scenarios that the user gives in a loop", () => {
    expect(sandboxDeckArguments(["a.json", "b.ts"])).toEqual(["--loop", "a.json", "b.ts"]);
  });
});
