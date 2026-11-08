import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { Recording } from "../../e2e/harness/recording.js";
import { claudeRecordingFromStatuses } from "./export-claude-recording.js";
import type { ExportedEvent } from "./recording-export.js";

// The hub reads only the status. The export keeps a status of this form and drops all other values.
const statusPattern = /^[a-z_]{1,40}$/;
const registrationFilePattern = /^\d+\.json$/;
// A status time from the registration can be a little later than the clock of the watcher.
const clockToleranceMilliseconds = 1_000;

const registrationSchema = z.looseObject({
  pid: z.number(),
  sessionId: z.string(),
  version: z.string().optional(),
  status: z.string().optional(),
  statusUpdatedAt: z.number().optional(),
});

export type WatchedRegistration = z.infer<typeof registrationSchema>;

/** Collects the changes of the status of one registration. It keeps the status and the time of each change. */
export class ClaudeStatusRecorder {
  readonly events: ExportedEvent[] = [];
  version: string | undefined;
  private lastStatus: string | undefined;

  observe(registration: WatchedRegistration, observedAtMilliseconds: number): void {
    this.version ??= registration.version;
    const status = registration.status;
    if (!status || !statusPattern.test(status) || status === this.lastStatus) return;
    this.lastStatus = status;
    const firstTime = this.events[0]?.timestampMilliseconds;
    const reported = registration.statusUpdatedAt;
    // The first status may be old. The recording starts when the watch starts. Later changes use the time that Claude Code reports.
    const useReported =
      firstTime !== undefined && reported !== undefined && reported >= firstTime && reported <= observedAtMilliseconds + clockToleranceMilliseconds;
    this.events.push({ timestampMilliseconds: useReported ? reported : observedAtMilliseconds, line: { status } });
  }

  toRecording(): Recording {
    if (this.events.length === 0) throw new Error("The watch saw no status. Make sure that the session is running.");
    return claudeRecordingFromStatuses(this.events, this.version);
  }
}

export interface WatchOptions {
  /** The Claude Code folder, for example `~/.claude`. */
  home: string;
  /** A session identifier or a process identifier. It can be missing when exactly one session runs. */
  target?: string;
  intervalMilliseconds: number;
  /** The watch ends when the signal aborts, or when the session ends. */
  signal: AbortSignal;
  report: (line: string) => void;
}

interface FoundRegistration {
  path: string;
  registration: WatchedRegistration;
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolvePromise) => {
    const timer = setTimeout(resolvePromise, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolvePromise();
      },
      { once: true },
    );
  });
}

async function readRegistration(path: string): Promise<WatchedRegistration | undefined> {
  try {
    const parsed = registrationSchema.safeParse(JSON.parse(await readFile(path, "utf8")));
    return parsed.success ? parsed.data : undefined;
  } catch {
    // The file can be missing or half written. The next poll tries again.
    return undefined;
  }
}

async function findRegistrations(home: string): Promise<FoundRegistration[]> {
  const directory = join(home, "sessions");
  const found: FoundRegistration[] = [];
  for (const name of await readdir(directory).catch(() => [])) {
    if (!registrationFilePattern.test(name)) continue;
    const path = join(directory, name);
    const registration = await readRegistration(path);
    if (registration) found.push({ path, registration });
  }
  return found;
}

function chooseRegistration(found: FoundRegistration[], target: string | undefined): FoundRegistration | undefined {
  if (target) return found.find((item) => item.registration.sessionId === target || String(item.registration.pid) === target);
  if (found.length === 1) return found[0];
  if (found.length === 0) return undefined;
  const lines = found.map(
    (item) => `  pid ${String(item.registration.pid)}  session ${item.registration.sessionId}  status ${item.registration.status ?? "none"}`,
  );
  throw new Error(`More than one session runs. Give a session identifier or a process identifier:\n${lines.join("\n")}`);
}

/**
 * Watches the registration file of one running Claude Code session and records each change of its status.
 * The registration has no history, so only a watch during the session can capture a status such as `permission_required`.
 * The watch ends when the session ends or when the signal aborts.
 */
export async function watchClaudeSession(options: WatchOptions): Promise<Recording> {
  let found = chooseRegistration(await findRegistrations(options.home), options.target);
  while (!found && !options.signal.aborted) {
    options.report("Waiting for a running Claude Code session...");
    await delay(options.intervalMilliseconds, options.signal);
    found = chooseRegistration(await findRegistrations(options.home), options.target);
  }
  const recorder = new ClaudeStatusRecorder();
  if (!found) return recorder.toRecording();
  const { path, registration: first } = found;
  options.report(`Watching session ${first.sessionId} (process ${String(first.pid)}). Press Control and C to stop.`);
  recorder.observe(first, Date.now());
  while (!options.signal.aborted) {
    await delay(options.intervalMilliseconds, options.signal);
    const current = await readRegistration(path);
    if (!current) {
      // A missing file means that the session ended. A damaged file is a short state during a write.
      if (
        !(await readFile(path).then(
          () => true,
          () => false,
        ))
      )
        break;
      continue;
    }
    if (current.sessionId !== first.sessionId) break;
    const before = recorder.events.length;
    recorder.observe(current, Date.now());
    if (recorder.events.length > before) options.report(`Status: ${current.status ?? ""}`);
  }
  return recorder.toRecording();
}
