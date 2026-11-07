// Exports the sequence of events of one real session to a recording file. Run it by hand. The hub does not run it.
// Usage: npm run export:recording -- <codex|copilot|claude|junie> <session identifier or file> [--home=<folder>] [--out=<file>]
//        npm run export:recording -- <codex|copilot|claude|junie> --list [--home=<folder>] [--limit=<number>]
//        npm run export:recording -- claude --watch [<session or process identifier>] [--out=<file>]
// The recording has the event types, the time between them, and the pairing of requests. It has no content.
import { existsSync } from "node:fs";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { recordingSchema } from "../../e2e/harness/recording.js";
import { exportClaudeRecording } from "./export-claude-recording.js";
import { watchClaudeSession } from "./watch-claude-session.js";
import { exportJunieRecording } from "./export-junie-recording.js";
import { exportCodexRecording } from "./export-codex-recording.js";
import { exportCopilotRecording } from "./export-copilot-recording.js";

const homeArgumentPrefix = "--home=";
const outArgumentPrefix = "--out=";
const limitArgumentPrefix = "--limit=";
const listArgument = "--list";
const watchArgument = "--watch";
const intervalArgumentPrefix = "--interval=";
const defaultWatchIntervalMilliseconds = 250;
const defaultListLimit = 20;
const codexFilePattern = /^rollout-.*-([0-9a-f]{8}-[0-9a-f-]{27})\.jsonl$/;
const claudeFilePattern = /^([\w-]{1,80})\.jsonl$/;
const junieDirectoryPattern = /^session-[\w-]{1,80}$/;
const identifierPattern = /^[\w-]{1,80}$/;
const shortIdentifierLength = 8;

const usage = [
  "Usage: npm run export:recording -- <codex|copilot|claude|junie> <session identifier or file> [--home=<folder>] [--out=<file>]",
  "       npm run export:recording -- <codex|copilot|claude|junie> --list [--home=<folder>] [--limit=<number>]",
  "       npm run export:recording -- claude --watch [<session identifier or process identifier>] [--home=<folder>] [--out=<file>] [--interval=<milliseconds>]",
].join("\n");

interface ListedSession {
  identifier: string;
  modifiedAt: Date;
  bytes: number;
}

function optionValue(arguments_: string[], prefix: string): string | undefined {
  return arguments_.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

async function findCodexFile(home: string, identifier: string): Promise<string> {
  const entries = await readdir(join(home, "sessions"), { recursive: true });
  const match = entries.find((entry) => basename(entry).startsWith("rollout-") && basename(entry).endsWith(`-${identifier}.jsonl`));
  if (!match) throw new Error(`No rollout file for the session ${identifier} in ${join(home, "sessions")}`);
  return join(home, "sessions", match);
}

function agentHome(agent: string, homeOption: string | undefined): string {
  if (homeOption) return homeOption;
  if (agent === "codex") return process.env.AI_AI_CAPTAIN_CODEX_HOME ?? join(homedir(), ".codex");
  if (agent === "junie") return process.env.AI_AI_CAPTAIN_JUNIE_HOME ?? join(homedir(), ".junie", "sessions");
  if (agent === "claude") return process.env.AI_AI_CAPTAIN_CLAUDE_HOME ?? process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
  return process.env.AI_AI_CAPTAIN_COPILOT_HOME ?? join(homedir(), ".copilot");
}

/** Lists the sessions on this computer. It reads file names and file sizes only, never file content. */
async function listSessions(agent: string, home: string): Promise<ListedSession[]> {
  const found: ListedSession[] = [];
  if (agent === "codex") {
    const root = join(home, "sessions");
    for (const entry of await readdir(root, { recursive: true }).catch(() => [])) {
      const identifier = codexFilePattern.exec(basename(entry))?.[1];
      if (!identifier) continue;
      const info = await stat(join(root, entry));
      found.push({ identifier, modifiedAt: info.mtime, bytes: info.size });
    }
  } else if (agent === "junie") {
    for (const entry of await readdir(home).catch(() => [])) {
      const info = junieDirectoryPattern.test(entry) ? await stat(join(home, entry, "events.jsonl")).catch(() => undefined) : undefined;
      if (info) found.push({ identifier: entry, modifiedAt: info.mtime, bytes: info.size });
    }
  } else if (agent === "claude") {
    const root = join(home, "projects");
    for (const entry of await readdir(root, { recursive: true }).catch(() => [])) {
      const identifier = claudeFilePattern.exec(basename(entry))?.[1];
      // A transcript of a session is in a project folder, one level below the root.
      if (!identifier || entry.split("/").length !== 2) continue;
      const info = await stat(join(root, entry));
      found.push({ identifier, modifiedAt: info.mtime, bytes: info.size });
    }
  } else {
    const root = join(home, "session-state");
    for (const entry of await readdir(root).catch(() => [])) {
      const info = await stat(join(root, entry, "events.jsonl")).catch(() => undefined);
      if (info) found.push({ identifier: entry, modifiedAt: info.mtime, bytes: info.size });
    }
  }
  return found.sort((left, right) => right.modifiedAt.getTime() - left.modifiedAt.getTime());
}

async function printSessions(agent: string, home: string, limit: number): Promise<void> {
  const sessions = (await listSessions(agent, home)).slice(0, limit);
  for (const session of sessions) {
    process.stdout.write(`${session.identifier}  ${session.modifiedAt.toISOString()}  ${String(session.bytes)} bytes\n`);
  }
  if (sessions.length === 0) process.stdout.write(`No ${agent} sessions in ${home}\n`);
}

async function findClaudeFile(home: string, identifier: string): Promise<string> {
  const root = join(home, "projects");
  const entries = await readdir(root, { recursive: true });
  const match = entries.find((entry) => entry.split("/").length === 2 && basename(entry) === `${identifier}.jsonl`);
  if (!match) throw new Error(`No transcript for the session ${identifier} in ${root}`);
  return join(root, match);
}

async function readSource(agent: string, source: string, homeOption: string | undefined): Promise<string> {
  if (existsSync(source)) return readFile(source, "utf8");
  if (!identifierPattern.test(source)) throw new Error("The second argument must be a session identifier or the path of an existing file");
  if (agent === "codex") {
    return readFile(await findCodexFile(agentHome(agent, homeOption), source), "utf8");
  }
  if (agent === "junie") return readFile(join(agentHome(agent, homeOption), source, "events.jsonl"), "utf8");
  if (agent === "claude") return readFile(await findClaudeFile(agentHome(agent, homeOption), source), "utf8");
  const home = agentHome(agent, homeOption);
  return readFile(join(home, "session-state", source, "events.jsonl"), "utf8");
}

function exportRecording(agent: string, text: string): ReturnType<typeof exportCodexRecording> {
  if (agent === "codex") return exportCodexRecording(text);
  if (agent === "claude") return exportClaudeRecording(text);
  if (agent === "junie") return exportJunieRecording(text);
  return exportCopilotRecording(text);
}

async function writeRecordingFile(recording: unknown, outputPath: string): Promise<void> {
  const checked = recordingSchema.parse(recording);
  // The flag "wx" fails when the file exists, so the export never overwrites a file.
  await writeFile(outputPath, `${JSON.stringify(checked, undefined, 2)}\n`, { flag: "wx" });
  process.stdout.write(`Recording written: ${outputPath}\n`);
  process.stdout.write("The recording has no content. Read it before you share it.\n");
}

/** Watches a running Claude Code session until it ends or the user presses Control and C. */
async function watchClaude(options: string[]): Promise<void> {
  const target = options.find((option) => !option.startsWith("--"));
  const controller = new AbortController();
  process.once("SIGINT", () => {
    controller.abort();
  });
  process.once("SIGTERM", () => {
    controller.abort();
  });
  const recording = await watchClaudeSession({
    home: agentHome("claude", optionValue(options, homeArgumentPrefix)),
    ...(target ? { target } : {}),
    intervalMilliseconds: Number(optionValue(options, intervalArgumentPrefix) ?? defaultWatchIntervalMilliseconds),
    signal: controller.signal,
    report: (line) => process.stdout.write(`${line}\n`),
  });
  const name = `claude-${(target ?? "watch").slice(0, shortIdentifierLength)}.recording.json`;
  await writeRecordingFile(recording, resolve(optionValue(options, outArgumentPrefix) ?? name));
}

async function main(): Promise<void> {
  const [agent, source, ...options] = process.argv.slice(2);
  if ((agent !== "codex" && agent !== "copilot" && agent !== "claude" && agent !== "junie") || !source) throw new Error(usage);
  if (source === watchArgument) {
    if (agent !== "claude") throw new Error("The option --watch works for claude only. The other agents write a log, so use the export.");
    await watchClaude(options);
    return;
  }
  const homeOption = optionValue(options, homeArgumentPrefix);
  if (source === listArgument || options.includes(listArgument)) {
    await printSessions(agent, agentHome(agent, homeOption), Number(optionValue(options, limitArgumentPrefix) ?? defaultListLimit));
    return;
  }
  const text = await readSource(agent, source, homeOption);
  const outputPath = resolve(optionValue(options, outArgumentPrefix) ?? `${agent}-${source.slice(0, shortIdentifierLength)}.recording.json`);
  await writeRecordingFile(exportRecording(agent, text), outputPath);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
