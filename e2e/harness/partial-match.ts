interface AsymmetricMatcher {
  asymmetricMatch(other: unknown): boolean;
}

function isAsymmetricMatcher(value: unknown): value is AsymmetricMatcher {
  return typeof value === "object" && value !== null && "asymmetricMatch" in value && typeof value.asymmetricMatch === "function";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Finds the first difference between a value and an expectation. Gives undefined when they agree.
 * The expectation names only the fields that matter. Matchers of Vitest, such as `expect.objectContaining`, also work.
 */
export function findDifference(actual: unknown, expected: unknown, path = "session"): string | undefined {
  if (isAsymmetricMatcher(expected)) return expected.asymmetricMatch(actual) ? undefined : `${path} does not agree with the matcher`;
  if (isRecord(expected)) {
    if (!isRecord(actual)) return `${path} must be an object`;
    for (const [key, expectedValue] of Object.entries(expected)) {
      const difference = findDifference(actual[key], expectedValue, `${path}.${key}`);
      if (difference) return difference;
    }
    return undefined;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return `${path} must be a list of ${String(expected.length)} items`;
    for (const [index, expectedItem] of expected.entries()) {
      const difference = findDifference(actual[index], expectedItem, `${path}[${String(index)}]`);
      if (difference) return difference;
    }
    return undefined;
  }
  if (Object.is(actual, expected)) return undefined;
  return `${path} is ${JSON.stringify(actual)} but must be ${JSON.stringify(expected)}`;
}
