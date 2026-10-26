/**
 * Shows up to 24 Stream Deck keys with all key identities and all states that the hub API can set.
 *
 * The script sends demo sessions to the running hub and changes their states in a loop. It removes the demo
 * sessions when you stop it. Run it with `npm run demo:keys`. Use `-- --once` to send one step and wait,
 * and `-- --interval 5` to change the number of seconds between steps.
 *
 * The aged and assessed DONE looks need real session age. The API cannot set them.
 */
import { demoSessionIdentifiers, demoSessions, demoStateSequence } from "./demo-keys-plan.js";

const hubUrl = process.env.AI_AI_CAPTAIN_URL ?? "http://127.0.0.1:43681";
const defaultIntervalSeconds = 4;
// The hub sorts keys by last activity. A short pause keeps the key order the same after each step.
const orderingPauseMilliseconds = 3;

function readIntervalMilliseconds(argumentsList: string[]): number {
  const optionIndex = argumentsList.indexOf("--interval");
  const value = optionIndex >= 0 ? Number(argumentsList[optionIndex + 1]) : defaultIntervalSeconds;
  const seconds = Number.isFinite(value) && value > 0 ? value : defaultIntervalSeconds;
  return seconds * 1000;
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function sendRequest(path: string, method: string, body?: unknown): Promise<void> {
  const response = await fetch(`${hubUrl}${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok && response.status !== 404) throw new Error(`Hub request failed: ${method} ${path} returned ${response.status}`);
}

async function showStep(step: number): Promise<void> {
  const sessions = demoSessions(step);
  // Update the last key first, so that key 1 is the most recent and stays first.
  for (const session of sessions.toReversed()) {
    await sendRequest(`/api/sessions/${session.id}`, "PUT", session);
    await sleep(orderingPauseMilliseconds);
  }
  console.log(`Step ${step + 1}: key 1 shows "${sessions[0].state}", key 13 shows "${sessions[12].state}".`);
}

async function removeDemoSessions(): Promise<void> {
  for (const identifier of demoSessionIdentifiers()) {
    await sendRequest(`/api/sessions/${identifier}`, "DELETE");
  }
  console.log("Demo sessions removed.");
}

async function main(): Promise<void> {
  const argumentsList = process.argv.slice(2);
  const once = argumentsList.includes("--once");
  const intervalMilliseconds = readIntervalMilliseconds(argumentsList);
  let stopped = false;
  const stop = (): void => { stopped = true; };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  console.log(`Demo uses the hub at ${hubUrl}. Press Ctrl+C to stop and remove the demo keys.`);
  let step = 0;
  try {
    while (!stopped) {
      await showStep(step);
      step = (step + 1) % demoStateSequence.length;
      if (once) {
        await new Promise<void>((resolve) => {
          const timer = setInterval(() => {
            if (!stopped) return;
            clearInterval(timer);
            resolve();
          }, 200);
        });
        break;
      }
      await sleep(intervalMilliseconds);
    }
  } finally {
    await removeDemoSessions();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`Demo stopped: ${message}. Make sure that the hub runs.`);
  process.exitCode = 1;
});
