const millisecondsPerSecond = 1_000;
const millisecondsPerUnit: Record<string, number> = { ms: 1, s: millisecondsPerSecond, m: 60 * millisecondsPerSecond };

export const durationPattern = /^(\d+(?:\.\d+)?)(ms|s|m)$/;

/** Converts a duration text, for example "150ms", "2s", or "11m", to milliseconds. */
export function parseDurationMilliseconds(text: string): number {
  const match = durationPattern.exec(text);
  if (!match) throw new Error(`The duration "${text}" is not valid. Use a number and the unit ms, s, or m.`);
  return Number(match[1]) * millisecondsPerUnit[match[2]];
}

/** Converts milliseconds to a duration text for a recording. */
export function formatDurationMilliseconds(milliseconds: number): string {
  if (milliseconds % millisecondsPerSecond === 0) return `${String(milliseconds / millisecondsPerSecond)}s`;
  return `${String(milliseconds)}ms`;
}
