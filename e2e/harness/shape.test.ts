import { describe, expect, it } from "vitest";
import { compareShapes, deriveShape, findShapeDifferences, type Shape } from "./shape.js";

const description = { agent: "test-agent", agentVersion: "1.0.0", file: "state.json", capturedAt: "2026-11-07" };

const shape: Shape = deriveShape({ pid: 1, name: "a", flags: [], nested: {}, ok: true, nothing: null }, description);

describe("shape files", () => {
  it("keeps the key order and the value types, and no values", () => {
    expect(shape.keys).toEqual([
      { name: "pid", type: "number" },
      { name: "name", type: "string" },
      { name: "flags", type: "array" },
      { name: "nested", type: "object" },
      { name: "ok", type: "boolean" },
      { name: "nothing", type: "null" },
    ]);
    expect(JSON.stringify(shape)).not.toContain('"a"');
  });

  it("accepts a file with fewer keys in the same order", () => {
    expect(findShapeDifferences({ pid: 2, ok: false }, shape)).toEqual([]);
  });

  it("finds an unknown key, a wrong type, and a wrong order", () => {
    expect(findShapeDifferences({ extra: 1 }, shape)).toHaveLength(1);
    expect(findShapeDifferences({ pid: "1" }, shape)).toEqual(['The key "pid" has the type string, but the shape has number']);
    expect(findShapeDifferences({ name: "a", pid: 1 }, shape)).toEqual(['The key "pid" is in another place than in the shape']);
  });

  it("reports the keys that a new version adds, removes, or changes", () => {
    const next = deriveShape({ pid: "1", name: "a", flags: [], nested: {}, ok: true, mode: "x" }, { ...description, agentVersion: "1.1.0" });
    expect(compareShapes(shape, next)).toEqual({ added: ["mode"], removed: ["nothing"], retyped: ["pid"] });
  });
});
