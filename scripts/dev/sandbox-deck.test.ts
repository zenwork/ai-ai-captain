import { describe, expect, it } from "vitest";
import { missingScenarioFiles, sandboxDeckArguments } from "./sandbox-deck.js";

describe("sandbox deck arguments", () => {
  it("plays the life cycle scenario in a loop when no scenario is given", () => {
    expect(sandboxDeckArguments([])).toEqual(["--loop", "e2e/scenarios/claude-code-lifecycle.ts"]);
  });

  it("plays the scenarios that the user gives in a loop", () => {
    expect(sandboxDeckArguments(["a.json", "b.ts"])).toEqual(["--loop", "a.json", "b.ts"]);
  });

  it("passes options to the sandbox and keeps the default scenario when only options are given", () => {
    expect(sandboxDeckArguments(["--fast"])).toEqual(["--loop", "--fast", "e2e/scenarios/claude-code-lifecycle.ts"]);
    expect(sandboxDeckArguments(["--fast", "--settle=2s", "a.json"])).toEqual(["--loop", "--fast", "--settle=2s", "a.json"]);
  });

  it("finds scenario files that do not exist and ignores options", () => {
    const exists = (path: string): boolean => path.endsWith("real.json");
    expect(missingScenarioFiles(["claude", "list", "--fast", "e2e/real.json"], exists)).toEqual(["claude", "list"]);
    expect(missingScenarioFiles([], exists)).toEqual([]);
  });
});
