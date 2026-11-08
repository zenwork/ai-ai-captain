import { isAbsolute, relative, resolve } from "node:path";

/** Gives the value of a placeholder. The agent key is the part after the colon, for example `{PID:cli}`. */
export type PlaceholderLookup = (name: string, agentKey: string | undefined) => string | number;

const placeholderPattern = /\{([A-Z_0-9]+)(?::([A-Za-z0-9_-]+))?\}/g;
const wholePlaceholderPattern = /^\{([A-Z_0-9]+)(?::([A-Za-z0-9_-]+))?\}$/;

// A value that is only one of these placeholders keeps its number type in a JSON object.
const numericPlaceholderNames = new Set(["PID", "T", "NOW_MS"]);

function resolveText(text: string, lookup: PlaceholderLookup): string | number {
  const whole = wholePlaceholderPattern.exec(text);
  if (whole && numericPlaceholderNames.has(whole[1])) return lookup(whole[1], whole[2]);
  return text.replace(placeholderPattern, (_match, name: string, agentKey: string | undefined) => String(lookup(name, agentKey)));
}

/** Replaces the placeholders in a text or in all texts of a JSON value. */
export function resolvePlaceholders(value: unknown, lookup: PlaceholderLookup): unknown {
  if (typeof value === "string") return resolveText(value, lookup);
  if (Array.isArray(value)) return value.map((item: unknown) => resolvePlaceholders(item, lookup));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolvePlaceholders(item, lookup)]));
  }
  return value;
}

/**
 * Makes sure that a path from a recording stays inside the temporary folder.
 * A recording comes from outside, so a path such as `{CLAUDE_HOME}/../../x` must not write outside the folder.
 */
export function resolveInsideDirectory(directory: string, path: string): string {
  const resolved = resolve(path);
  const difference = relative(directory, resolved);
  if (difference.startsWith("..") || isAbsolute(difference)) {
    throw new Error("A recording step uses a path outside the temporary folder");
  }
  return resolved;
}
