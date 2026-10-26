import type { SessionState } from "./session.js";

export function hookSessionId(event: Record<string, unknown>, explicitId?: string): string {
  const value = explicitId ?? event.session_id ?? event["session-id"] ?? event.sessionId ?? event["thread-id"] ?? event.thread_id ?? event.threadId;
  if (typeof value !== "string" || !value.trim()) throw new Error("Hook payload has no session identifier. Supply session_id/thread-id or pass --id; an event ID cannot identify a session.");
  return value.trim();
}

function normalizeEventName(event: string): string {
  return event.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase().replace(/[_.]/g, "-");
}

export function hookEndsSession(event: string): boolean {
  const normalized = normalizeEventName(event);
  return /session-?(end|shutdown)/.test(normalized) || normalized === "end";
}

export function stateForHook(event: string, payload: Record<string, unknown> = {}): SessionState {
  let normalized = normalizeEventName(event);
  if (normalized === "notification") {
    if (typeof payload.notification_type !== "string") return "unknown";
    normalized = normalizeEventName(payload.notification_type);
  }
  if (/permission/.test(normalized)) return /complete|approved|resolved/.test(normalized) ? "working" : "waiting";
  if (/input-required|input-request|awaiting-input|elicitation-dialog/.test(normalized)) return "waiting";
  if (hookEndsSession(event)) return "done";
  if (/session-?(start|resume)/.test(normalized)) return "starting";
  if (/tool/.test(normalized)) return "working";
  if (/fail|error/.test(normalized)) return "failed";
  if (/stop|turn-end|complete|idle|cancel/.test(normalized)) return "done";
  if (/prompt|turn-start|start/.test(normalized)) return "working";
  return "unknown";
}
