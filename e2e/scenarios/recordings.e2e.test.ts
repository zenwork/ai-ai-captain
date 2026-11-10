import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import { isAgentSimulationSupported } from "../harness/agent-process.js";
import { recordingSchema } from "../harness/recording.js";
import { scenario } from "../harness/scenario.js";

const fixtureDirectory = fileURLToPath(new URL("../fixtures/", import.meta.url));

function findRecordings(directory: string): string[] {
  const recordings: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      recordings.push(...findRecordings(path));
    } else if (entry.isFile() && entry.name.endsWith(".recording.json")) {
      recordings.push(path);
    }
  }
  return recordings.sort();
}

describe.skipIf(!isAgentSimulationSupported)("recording fixtures", () => {
  for (const path of findRecordings(fixtureDirectory)) {
    const recording = recordingSchema.parse(JSON.parse(readFileSync(path, "utf8")));
    const unsupportedJunie = recording.header.agent === "junie" && process.platform !== "darwin";
    it.skipIf(unsupportedJunie)(relative(fixtureDirectory, path), async () => {
      await scenario.fromRecording(path).run();
    });
  }
});
