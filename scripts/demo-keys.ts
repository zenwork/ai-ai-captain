/**
 * Shows up to 24 Stream Deck keys with all key identities and all states that the hub API can set.
 *
 * The script sends demo sessions to the running hub and changes their states in a loop. It removes the demo
 * sessions when you stop it. Run it with `npm run demo:keys`. Use `-- --once` to send one step and wait,
 * and `-- --interval 5` to change the number of seconds between steps. Use `-- --brightness` to show WAITING
 * and DONE keys at flash intensity 0 through 4.
 *
 * The aged and assessed DONE looks need real session age. The API cannot set them.
 */
import {
  allDemoSessionIdentifiers,
  demoBrightnessSessions,
  demoSessionIdPrefix,
  demoSessions,
  demoStateSequence,
} from "./demo-keys-plan.js";

const hubUrl = process.env.AI_AI_CAPTAIN_URL ?? "http://127.0.0.1:43681";
const defaultIntervalSeconds = 4;
// The hub sorts keys by last activity. A short pause keeps the key order the same after each step.
const orderingPauseMilliseconds = 3;
const stopPollMilliseconds = 50;

function readIntervalMilliseconds(argumentsList: string[]): number {
  const optionIndex = argumentsList.indexOf("--interval");
  const value = optionIndex >= 0 ? Number(argumentsList[optionIndex + 1]) : defaultIntervalSeconds;
  const seconds = Number.isFinite(value) && value > 0 ? value : defaultIntervalSeconds;
  return seconds * 1000;
}

async function sleep(milliseconds: number, stopped?: () => boolean): Promise<void> {
  await new Promise<void>((resolve) => {
    const finish = (): void => {
      clearTimeout(timeout);
      if (poll !== undefined) clearInterval(poll);
      resolve();
    };
    const timeout = setTimeout(finish, milliseconds);
    const poll = stopped === undefined ? undefined : setInterval(() => {
      if (stopped()) finish();
    }, stopPollMilliseconds);
  });
}

async function sendRequest(path: string, method: string, body?: unknown): Promise<void> {
  const response = await fetch(`${hubUrl}${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok && response.status !== 404) throw new Error(`Hub request failed: ${method} ${path} returned ${response.status}`);
}

function sessionIdentifier(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || !("id" in value)) return undefined;
  if (typeof value.id !== "string" || !value.id.startsWith(demoSessionIdPrefix)) return undefined;
  return value.id;
}

async function liveDemoSessionIdentifiers(): Promise<string[]> {
  const response = await fetch(`${hubUrl}/api/sessions`);
  if (!response.ok) return [];
  const payload: unknown = await response.json();
  if (typeof payload !== "object" || payload === null || !("sessions" in payload) || !Array.isArray(payload.sessions)) return [];
  const identifiers: string[] = [];
  for (const session of payload.sessions) {
    const identifier = sessionIdentifier(session);
    if (identifier !== undefined) identifiers.push(identifier);
  }
  return identifiers;
}

async function showSessions(sessions: ReturnType<typeof demoSessions>, message: string, stopped: () => boolean): Promise<void> {
  // Update the last key first, so that key 1 is the most recent and stays first.
  for (const session of sessions.toReversed()) {
    if (stopped()) return;
    await sendRequest(`/api/sessions/${session.id}`, "PUT", session);
    await sleep(orderingPauseMilliseconds, stopped);
  }
  console.log(message);
}

async function showStep(step: number, stopped: () => boolean): Promise<void> {
  const sessions = demoSessions(step);
  await showSessions(sessions, `Step ${step + 1}: key 1 shows "${sessions[0].state}", key 13 shows "${sessions[12].state}".`, stopped);
}

async function showBrightness(stopped: () => boolean): Promise<void> {
  const sessions = demoBrightnessSessions();
  await showSessions(sessions, "Brightness demo: keys 1-5 WAITING, keys 6-10 DONE. Intensity 0 to 4 from left to right.", stopped);
  for (const [index, session] of sessions.entries()) {
    console.log(`Key ${index + 1}: ${session.state.toUpperCase()} flash intensity ${session.metadata?.flashIntensity}.`);
  }
}

async function waitUntilStopped(stopped: () => boolean): Promise<void> {
  await new Promise<void>((resolve) => {
    const timer = setInterval(() => {
      if (!stopped()) return;
      clearInterval(timer);
      resolve();
    }, stopPollMilliseconds);
  });
}

async function removeDemoSessions(): Promise<void> {
  const identifiers = new Set(allDemoSessionIdentifiers());
  try {
    for (const identifier of await liveDemoSessionIdentifiers()) identifiers.add(identifier);
  } catch {
    // The hub list failed. Still delete the known demo identifiers.
  }
  for (const identifier of identifiers) {
    await sendRequest(`/api/sessions/${identifier}`, "DELETE");
  }
}

async function main(): Promise<void> {
  const argumentsList = process.argv.slice(2);
  const once = argumentsList.includes("--once");
  const brightness = argumentsList.includes("--brightness");
  const intervalMilliseconds = readIntervalMilliseconds(argumentsList);
  let stopped = false;
  let removal: Promise<void> | undefined;
  const isStopped = (): boolean => stopped;
  const startRemoval = (): Promise<void> => {
    removal ??= removeDemoSessions();
    return removal;
  };
  const stop = (): void => {
    stopped = true;
    void startRemoval();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  console.log(`Demo uses the hub at ${hubUrl}. Press Ctrl+C to stop and remove the demo keys.`);
  let step = 0;
  try {
    if (brightness) {
      await showBrightness(isStopped);
      await waitUntilStopped(isStopped);
      return;
    }
    while (!stopped) {
      await showStep(step, isStopped);
      step = (step + 1) % demoStateSequence.length;
      if (once) {
        await waitUntilStopped(isStopped);
        break;
      }
      await sleep(intervalMilliseconds, isStopped);
    }
  } finally {
    stopped = true;
    await startRemoval();
    // A last pass removes keys that a late update recreated after the first delete.
    await removeDemoSessions();
    console.log("Demo sessions removed.");
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`Demo stopped: ${message}. Make sure that the hub runs.`);
  process.exitCode = 1;
});
