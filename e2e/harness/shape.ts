import { z } from "zod";

const valueTypeSchema = z.enum(["string", "number", "boolean", "array", "object", "null"]);
// A key can have more than one type in real files, for example an object or null. A list names all the types that were seen.
const keyTypeSchema = z.union([valueTypeSchema, z.array(valueTypeSchema).min(1)]);
const keySchema = z.object({ name: z.string().min(1), type: keyTypeSchema });

const descriptionShape = {
  agent: z.string().min(1),
  agentVersion: z.string().min(1),
  /** The file in the agent folder that the shape describes. */
  file: z.string().min(1),
  capturedAt: z.iso.date(),
};

/** The key names, the key order, and the value types of a file. It has no values, so it holds no private data. */
export const shapeSchema = z.object({ ...descriptionShape, keys: z.array(keySchema) });

/** Several shapes of one file, for example one shape for each event type of a log file. The names tell the shapes apart. */
export const shapeCatalogSchema = z.object({ ...descriptionShape, shapes: z.record(z.string(), z.array(keySchema)) });

export type Shape = z.infer<typeof shapeSchema>;
export type ShapeCatalog = z.infer<typeof shapeCatalogSchema>;
export type ShapeKey = z.infer<typeof keySchema>;
type ValueType = z.infer<typeof valueTypeSchema>;

function valueTypeOf(value: unknown): ValueType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "object";
}

function allowedTypes(key: ShapeKey): ValueType[] {
  return Array.isArray(key.type) ? key.type : [key.type];
}

/** Makes the shape of a JSON object, for example from the registration file of a real session. */
export function deriveShape(value: Record<string, unknown>, description: Omit<Shape, "keys">): Shape {
  return { ...description, keys: Object.entries(value).map(([name, item]) => ({ name, type: valueTypeOf(item) })) };
}

export interface KeyCheckOptions {
  /** With `false`, the key order can be different. Use it for shapes that were joined from many files. */
  checkOrder: boolean;
}

/**
 * Finds what is different between an object of a simulator and the keys of a real file.
 * A simulator can write fewer keys than the real agent. It must not write an unknown key or a key of another type.
 * With `checkOrder`, it must also write the keys in the order of the real file.
 */
export function findKeyDifferences(value: Record<string, unknown>, keys: ShapeKey[], label: string, options: KeyCheckOptions): string[] {
  const differences: string[] = [];
  const keyIndex = new Map(keys.map((key, index) => [key.name, { index, key }]));
  let previousIndex = -1;
  for (const [name, item] of Object.entries(value)) {
    const known = keyIndex.get(name);
    if (!known) {
      differences.push(`The key "${name}" is not in the shape of ${label}`);
      continue;
    }
    const actualType = valueTypeOf(item);
    if (!allowedTypes(known.key).includes(actualType)) {
      differences.push(`The key "${name}" has the type ${actualType}, but the shape has ${allowedTypes(known.key).join(" or ")}`);
    }
    if (options.checkOrder && known.index < previousIndex) differences.push(`The key "${name}" is in another place than in the shape`);
    previousIndex = Math.max(previousIndex, known.index);
  }
  return differences;
}

/** Finds the differences between a file of a simulator and the shape of a real file. The key order must agree. */
export function findShapeDifferences(value: Record<string, unknown>, shape: Shape): string[] {
  return findKeyDifferences(value, shape.keys, `${shape.agent} ${shape.agentVersion}`, { checkOrder: true });
}

/** Compares the shape of an old version with the shape of a new version. Use it when a new agent version comes out. */
export function compareShapes(previous: Shape, current: Shape): { added: string[]; removed: string[]; retyped: string[] } {
  const previousTypes = new Map(previous.keys.map((key) => [key.name, allowedTypes(key).toSorted().join("|")]));
  const currentTypes = new Map(current.keys.map((key) => [key.name, allowedTypes(key).toSorted().join("|")]));
  return {
    added: current.keys.filter((key) => !previousTypes.has(key.name)).map((key) => key.name),
    removed: previous.keys.filter((key) => !currentTypes.has(key.name)).map((key) => key.name),
    retyped: [...currentTypes].filter(([name, type]) => previousTypes.has(name) && previousTypes.get(name) !== type).map(([name]) => name),
  };
}
