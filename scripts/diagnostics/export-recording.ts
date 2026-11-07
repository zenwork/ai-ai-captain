// Exports the sequence of events of one real session to a recording file. Run it by hand. The hub does not run it.
// Usage: npm run export:recording -- <codex|copilot> <session identifier or file> [--home=<folder>] [--out=<file>]
// The recording has the event types, the time between them, and the pairing of requests. It has no content.
import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { recordingSchema } from "../../e2e/harness/recording.js";
import { exportCodexRecording } from "./export-codex-recording.js";
import { exportCopilotRecording } from "./export-copilot-recording.js";

const homeArgumentPrefix = "--home=";
const outArgumentPrefix = "--out=";
const identifierPattern = /^[\w-]{1,80}$/;
const shortIdentifierLength = 8;

const usage = "Usage: npm run export:recording -- <codex|copilot> <session identifier or file> [--home=<folder>] [--out=<file>]";

function optionValue(arguments_: string[], prefix: string): string | undefined {
  return arguments_.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

async function findCodexFile(home: string, identifier: string): Promise<string> {
  const entries = await readdir(join(home, "sessions"), { recursive: true });
  const match = entries.find((entry) => basename(entry).startsWith("rollout-") && basename(entry).endsWith(`-${identifier}.jsonl`));
  if (!match) throw new Error(`No rollout file for the session ${identifier} in ${join(home, "sessions")}`);
  return join(home, "sessions", match);
}

async function readSource(agent: string, source: string, homeOption: string | undefined): Promise<string> {
  if (existsSync(source)) return readFile(source, "utf8");
  if (!identifierPattern.test(source)) throw new Error("The second argument must be a session identifier or the path of an existing file");
  if (agent === "codex") {
    const home = homeOption ?? process.env.AI_AI_CAPTAIN_CODEX_HOME ?? join(homedir(), ".codex");
    return readFile(await findCodexFile(home, source), "utf8");
  }
  const home = homeOption ?? process.env.AI_AI_CAPTAIN_COPILOT_HOME ?? join(homedir(), ".copilot");
  return readFile(join(home, "session-state", source, "events.jsonl"), "utf8");
}

async function main(): Promise<void> {
  const [agent, source, ...options] = process.argv.slice(2);
  if ((agent !== "codex" && agent !== "copilot") || !source) throw new Error(usage);
  const text = await readSource(agent, source, optionValue(options, homeArgumentPrefix));
  const recording = recordingSchema.parse(agent === "codex" ? exportCodexRecording(text) : exportCopilotRecording(text));
  const outputPath = resolve(optionValue(options, outArgumentPrefix) ?? `${agent}-${source.slice(0, shortIdentifierLength)}.recording.json`);
  // The flag "wx" fails when the file exists, so the export never overwrites a file.
  await writeFile(outputPath, `${JSON.stringify(recording, undefined, 2)}\n`, { flag: "wx" });
  process.stdout.write(`Recording written: ${outputPath}\n`);
  process.stdout.write("The recording has no content. Read it before you share it.\n");
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
