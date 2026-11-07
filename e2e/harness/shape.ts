import { z } from "zod";

const valueTypeSchema = z.enum(["string", "number", "boolean", "array", "object", "null"]);

/** The key names, the key order, and the value types of a file. It has no values, so it holds no private data. */
export const shapeSchema = z.object({
  agent: z.string().min(1),
  agentVersion: z.string().min(1),
  /** The file in the agent folder that the shape describes. */
  file: z.string().min(1),
  capturedAt: z.iso.date(),
  keys: z.array(z.object({ name: z.string().min(1), type: valueTypeSchema })),
});

export type Shape = z.infer<typeof shapeSchema>;
type ValueType = z.infer<typeof valueTypeSchema>;

function valueTypeOf(value: unknown): ValueType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "object";
}

/** Makes the shape of a JSON object, for example from the registration file of a real session. */
export function deriveShape(value: Record<string, unknown>, description: Omit<Shape, "keys">): Shape {
  return { ...description, keys: Object.entries(value).map(([name, item]) => ({ name, type: valueTypeOf(item) })) };
}

/**
 * Finds what is different between a file of a simulator and the shape of a real file.
 * A simulator can write fewer keys than the real agent. It must not write an unknown key, a key of another type,
 * or the keys in another order.
 */
export function findShapeDifferences(value: Record<string, unknown>, shape: Shape): string[] {
  const differences: string[] = [];
  const shapeIndex = new Map(shape.keys.map((key, index) => [key.name, { index, type: key.type }]));
  let previousIndex = -1;
  for (const [name, item] of Object.entries(value)) {
    const known = shapeIndex.get(name);
    if (!known) {
      differences.push(`The key "${name}" is not in the shape of ${shape.agent} ${shape.agentVersion}`);
      continue;
    }
    if (known.type !== valueTypeOf(item)) differences.push(`The key "${name}" has the type ${valueTypeOf(item)}, but the shape has ${known.type}`);
    if (known.index < previousIndex) differences.push(`The key "${name}" is in another place than in the shape`);
    previousIndex = Math.max(previousIndex, known.index);
  }
  return differences;
}

/** Compares the shape of an old version with the shape of a new version. Use it when a new agent version comes out. */
export function compareShapes(previous: Shape, current: Shape): { added: string[]; removed: string[]; retyped: string[] } {
  const previousTypes = new Map(previous.keys.map((key) => [key.name, key.type]));
  const currentTypes = new Map(current.keys.map((key) => [key.name, key.type]));
  return {
    added: current.keys.filter((key) => !previousTypes.has(key.name)).map((key) => key.name),
    removed: previous.keys.filter((key) => !currentTypes.has(key.name)).map((key) => key.name),
    retyped: current.keys.filter((key) => previousTypes.has(key.name) && previousTypes.get(key.name) !== key.type).map((key) => key.name),
  };
}
