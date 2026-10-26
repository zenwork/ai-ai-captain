import type { Session } from "./session.js";

export interface StateExplanation {
  summary: string;
  nextStep?: string;
}

export function explainSessionState(session: Session): StateExplanation {
  const metadata = session.metadata ?? {};
  if (session.state === "unknown") {
    if (metadata.tracking === "claude-registry") {
      return {
        summary: "The live Claude registration does not provide a supported current status, or the hub cannot read it.",
        nextStep: "Check the telemetry location and safe error code. AI AI Captain reads session metadata only. It does not change Claude settings.",
      };
    }
    if (metadata.tracking === "claude-accessibility") {
      return {
        summary: "The hub cannot verify the state of this exposed Claude chat through Accessibility controls.",
        nextStep: "Enable Accessibility access for the application that runs the hub. Expose the chat in Claude. Unsupported controls or languages remain UNKNOWN.",
      };
    }
    if (metadata.telemetryStatus === "missing") {
      return {
        summary: "A live session was detected, but its lifecycle event file could not be found. A running host process does not tell us whether the AI is working, waiting, or finished.",
        nextStep: "Continue the conversation and check the telemetry location below. If this runtime does not write local session history, a lifecycle reporter or host integration is needed. AI AI Captain has not changed the runtime's history settings.",
      };
    }
    if (metadata.telemetryStatus === "unreadable") {
      return {
        summary: "The hub could not read the session's telemetry file or directory. Its current state cannot be verified.",
        nextStep: "Check the error code and telemetry location below. Verify that the user running the hub can read the file; do not grant broad access unless it is actually needed.",
      };
    }
    if (metadata.telemetryStatus === "discovery-unavailable" || metadata.stateEvent === "discovery.unavailable") {
      return {
        summary: "The hub could not inspect live processes or open files. The previous state is deliberately not presented as current.",
        nextStep: "Check that the hub can run ps and lsof under your user account. Monitoring retries automatically; check the hub log if this persists.",
      };
    }
    if (metadata.telemetryStatus === "unrecognized" || metadata.stateEvent === "unobserved") {
      return {
        summary: "The event file is readable, but no supported lifecycle event has established a state yet. The file may be empty, partially written, or use an unsupported format.",
        nextStep: "Run another turn. If the state remains unknown, check whether the harness event format has changed or use a lifecycle reporter.",
      };
    }
    if (metadata.stateEvent === "events.unavailable") {
      return { summary: "Session telemetry is unavailable. The host is known, but activity cannot be inferred from its presence.", nextStep: "Check the local event files and adapter coverage. A missing project or model means that metadata has not been observed, not that the session is running." };
    }
    return { summary: "No supported lifecycle signal has established this session's state.", nextStep: "Check the reporter or adapter configuration. Unknown is not an error state and does not mean the AI is working." };
  }
  if (session.state === "working") return { summary: "A turn or tool operation is in progress according to the latest supported lifecycle signal." };
  if (session.state === "waiting") return { summary: "An input, approval, or other user action is required. This is not normal inactivity after a completed turn.", nextStep: "Open the session's host to answer the question or resolve the approval request." };
  if (session.state === "done") return { summary: session.ended ? "The session has closed and will be removed after ten seconds." : "The turn finished and no action is required. The conversation is still open; its completion alert fades over ten minutes, then stays dark blue." };
  if (session.state === "failed") return { summary: "A session-level failure was reported. Private error messages and transcript content are not retained.", nextStep: "Open the host application to inspect the original error. A later active turn can recover this state." };
  return { summary: "The session has started or resumed, but an active turn has not been observed yet." };
}
