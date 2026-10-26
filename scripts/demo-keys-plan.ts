import type { SessionInput, SessionState } from "../src/shared/session.js";
import { cardIdentities } from "../src/shared/card-design.js";
import type { SessionType } from "../streamdeck/src/cards.js";

export const demoKeyCount = 24;
export const demoSessionIdPrefix = "demo-keys-";
export const demoSource = "captain-demo";

// The sequence shows each state that the hub API can set. The DONE flash and its aging run in the plugin.
export const demoStateSequence: readonly SessionState[] = ["starting", "working", "waiting", "done", "failed", "unknown"];

// The second row starts at another point of the sequence, so one screen shows many states together.
const secondRowStateOffset = 3;

// Each harness name makes the plugin choose the matching key identity.
export const demoHarnessByIdentity: Record<SessionType, string> = {
  "copilot-cli": "copilot-cli",
  "copilot-ide": "copilot-ide",
  "copilot-app": "copilot-desktop-app",
  "codex-cli": "codex-cli",
  "codex-ide": "codex-ide",
  "codex-app": "codex-app",
  "intellij-ai": "jetbrains-ai",
  "claude-cli": "claude-cli",
  "claude-ide": "claude-ide",
  "claude-app": "claude-desktop",
  chatgpt: "chatgpt",
  generic: "demo-agent",
};

export function demoSessions(step: number): SessionInput[] {
  const identityCount = cardIdentities.length;
  const sessions: SessionInput[] = [];
  for (let index = 0; index < demoKeyCount; index += 1) {
    const identity = cardIdentities[index % identityCount];
    const row = Math.floor(index / identityCount);
    const stateIndex = (step + row * secondRowStateOffset) % demoStateSequence.length;
    const state = demoStateSequence[stateIndex];
    sessions.push({
      id: `${demoSessionIdPrefix}${String(index + 1).padStart(2, "0")}`,
      source: demoSource,
      harness: demoHarnessByIdentity[identity.id],
      label: `Demo ${identity.id}`,
      state,
      // DONE and FAILED sessions leave the hub after 10 seconds unless ended is false.
      ended: false,
    });
  }
  return sessions;
}

export function demoSessionIdentifiers(): string[] {
  return demoSessions(0).map((session) => session.id);
}
