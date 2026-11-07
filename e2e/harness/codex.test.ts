import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { codex, codexFixtureVersion, findRolloutLineDifferences } from "./codex.js";
import type { Operation } from "./recording.js";
import { shapeCatalogSchema } from "./shape.js";

const catalogUrl = new URL(`../fixtures/codex/${codexFixtureVersion}/rollout-events.shape.json`, import.meta.url);
const catalog = shapeCatalogSchema.parse(JSON.parse(readFileSync(catalogUrl, "utf8")));
const steps = codex({ model: "codex-model" })("cli").steps;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function appendedLines(operations: Operation[]): Record<string, unknown>[] {
  return operations.flatMap((operation) => (operation.operation === "append" && isRecord(operation.content) ? [operation.content] : []));
}

describe("the Codex simulator", () => {
  const everyStep: Record<string, Operation[]> = {
    spawn: steps.spawn(),
    turnContext: steps.turnContext(),
    startTurn: steps.startTurn(),
    tokenCount: steps.tokenCount(),
    requestPermission: steps.requestPermission(),
    approve: steps.approve(),
    completeTurn: steps.completeTurn(),
  };

  for (const [name, operations] of Object.entries(everyStep)) {
    it(`writes only keys of the real rollout format in the step ${name}`, () => {
      for (const line of appendedLines(operations)) {
        expect(findRolloutLineDifferences(line, catalog)).toEqual([]);
      }
    });
  }

  it("finds an unknown key and a key of another type", () => {
    const differences = findRolloutLineDifferences({ timestamp: 5, type: "event_msg", payload: { type: "task_started", invented: true }, extra: 1 }, catalog);
    expect(differences.join("\n")).toContain('The key "invented"');
    expect(differences.join("\n")).toContain('The key "extra"');
    expect(differences.join("\n")).toContain('The key "timestamp" has the type number');
  });

  it("holds the lock file and the rollout file open after the spawn", () => {
    const kinds = steps.spawn().map((operation) => operation.operation);
    expect(kinds.slice(0, 3)).toEqual(["spawn", "holdOpen", "holdOpen"]);
  });

  it("gives the session identifier that the hub uses", () => {
    expect(codex()("cli").sessionIdentifier("abc")).toBe("codex:abc");
  });
});
