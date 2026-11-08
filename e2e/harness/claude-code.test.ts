import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { claudeCode, claudeCodeFixtureVersion } from "./claude-code.js";
import { resolvePlaceholders } from "./placeholders.js";
import { findShapeDifferences, shapeSchema } from "./shape.js";

const shapePath = fileURLToPath(new URL(`../fixtures/claude-code/${claudeCodeFixtureVersion}/registration.shape.json`, import.meta.url));
const shape = shapeSchema.parse(JSON.parse(readFileSync(shapePath, "utf8")));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const values: Record<string, string | number> = {
  PID: 4242,
  T: 1_700_000_000_000,
  SESSION: "0b9f5c4e-2a7d-4e60-9d1c-3f6a8b7c5d21",
  PROJECT_1: "/tmp/project-1",
};

describe("claude code simulator", () => {
  it("writes a registration that agrees with the shape of the real file", () => {
    const steps = claudeCode({})("cli").steps;
    for (const status of ["starting", "busy", "needs_input", "permission_required", "idle"] as const) {
      const [operation] = steps.status(status);
      if (operation.operation !== "write") throw new Error("The step must write a file");
      const content = resolvePlaceholders(operation.content, (name) => values[name]);
      if (!isRecord(content)) throw new Error("The registration must be an object");
      expect(findShapeDifferences(content, shape)).toEqual([]);
    }
  });
});
