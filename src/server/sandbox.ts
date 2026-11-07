import { z } from "zod";

const defaultDiscoveryIntervalMilliseconds = 5_000;
// A shorter interval makes the hub use too much processor time. Test harnesses are the only users of a short interval.
const minimumDiscoveryIntervalMilliseconds = 100;

const discoveryIntervalSchema = z.coerce.number().int().min(minimumDiscoveryIntervalMilliseconds);
const focusLogPathSchema = z.string().min(1);

export interface SandboxSettings {
  /** True when the hub runs for a test or a demonstration. The hub then does not scan real desktop applications. */
  enabled: boolean;
  discoveryIntervalMilliseconds: number;
  /** Path of a file that receives the focus commands. When set, the hub writes the commands and does not run them. */
  focusLogPath?: string;
}

/** Reads the settings for test harnesses. An invalid value gives the default value, because the hub must always start. */
export function readSandboxSettings(environment: NodeJS.ProcessEnv): SandboxSettings {
  const interval = discoveryIntervalSchema.safeParse(environment.AI_AI_CAPTAIN_DISCOVERY_INTERVAL_MILLISECONDS);
  const focusLogPath = focusLogPathSchema.safeParse(environment.AI_AI_CAPTAIN_FOCUS_LOG);
  return {
    enabled: environment.AI_AI_CAPTAIN_SANDBOX === "1",
    discoveryIntervalMilliseconds: interval.success ? interval.data : defaultDiscoveryIntervalMilliseconds,
    ...(focusLogPath.success ? { focusLogPath: focusLogPath.data } : {}),
  };
}
