import type { Session } from "../src/shared/session.js";
import { explainSessionState } from "../src/shared/diagnostics.js";

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function timestamp(value?: string): string {
  return value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : "Not observed";
}

export function sessionDetails(session: Session, expanded = session.state === "unknown"): string {
  const explanation = explainSessionState(session);
  const metadata = session.metadata ?? {};
  const facts = [
    ["Session ID", session.id],
    ["Tracking", metadata.tracking ?? "Lifecycle reporter"],
    ["Source / harness", `${session.source} / ${session.harness ?? "Not supplied"}`],
    ["State event", metadata.stateEvent ?? "Not supplied by reporter"],
    ["Telemetry status", metadata.telemetryStatus ?? "Not supplied by reporter"],
    ["Last observed event", timestamp(metadata.lastTelemetryAt)],
    ["State changed", timestamp(session.stateChangedAt)],
    ["Last report received", timestamp(session.updatedAt)],
    ["Project", session.project ?? "Not observed"],
    ["Model", session.model ?? "Not observed"],
    ["Host", metadata.host ?? session.focusTarget?.appName ?? "Not observed"],
    ["Session runtime PID", metadata.ownerPid ?? "Not supplied"],
    ["Host PID", session.focusTarget?.pid ? String(session.focusTarget.pid) : "Not supplied"],
    ["Host lifetime", metadata.hostLifetime ?? "Not supplied"],
    ["Lifetime evidence", metadata.hostEvidence ?? "Not supplied"],
    ...(metadata.projectOpenedAt ? [["Project opened", timestamp(metadata.projectOpenedAt)]] : []),
    ...(metadata.lastTriggeredAt ? [["Last session start / turn", timestamp(metadata.lastTriggeredAt)]] : []),
    ...(metadata.telemetryLocation ? [["Telemetry location", metadata.telemetryLocation]] : []),
    ...(metadata.telemetryError ? [["Read error code", metadata.telemetryError]] : []),
  ];
  return `<div class="session-diagnostics"><p class="state-explanation">${escapeHtml(explanation.summary)}</p><details class="state-details" data-details-id="${escapeHtml(session.id)}"${expanded ? " open" : ""}><summary>State details &amp; evidence</summary>${explanation.nextStep ? `<p class="state-next-step">${escapeHtml(explanation.nextStep)}</p>` : ""}<dl>${facts.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl></details></div>`;
}
