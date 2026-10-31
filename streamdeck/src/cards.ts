import type { Client, Session } from "../../src/shared/session.js";
import { doneAttention } from "../../src/shared/attention.js";
import { cardIdentities, cardStates, describeInfoCard, escapeXml, renderCard, renderControl, renderInfoCard, type CardColors, type CardPalette, type CardPhase, type InfoCardData } from "../../src/shared/card-design.js";
import { cardIcons } from "../../src/shared/card-assets.js";
import { applyFlashIntensity, resolveFlashIntensity } from "../../src/shared/flash-intensity.js";
import { getPalette, type PaletteId } from "../../src/shared/palette.js";
import type { FlashIntensity } from "../../src/shared/settings.js";

export interface CardOptions {
  palette?: PaletteId;
  flashIntensity?: number;
  waitingDimmed?: boolean;
  now?: number;
  reducedMotion?: boolean;
}

export const waitingPulseIntervalMs = 1200;
export type SessionType = typeof cardIdentities[number]["id"];

export function sessionType(session: Session): SessionType {
  const identity = `${session.harness ?? ""} ${session.source}`.toLowerCase();
  const host = `${session.metadata?.host ?? ""} ${session.focusTarget?.appName ?? ""} ${session.focusTarget?.appPath ?? ""} ${session.focusTarget?.bundleId ?? ""}`;
  const inIde = /intellij|jetbrains/i.test(host) || /(?:^|[ -])ide(?:$|[ -])/.test(identity);
  const inApp = /desktop|(?:^|[ -])app(?:$|[ -])/.test(identity);
  if (identity.includes("copilot")) return inApp ? "copilot-app" : inIde ? "copilot-ide" : "copilot-cli";
  if (identity.includes("codex")) return inIde ? "codex-ide" : inApp ? "codex-app" : "codex-cli";
  if (identity.includes("claude")) {
    if (inIde) return "claude-ide";
    if (inApp || (!identity.includes("cli") && /claude/i.test(host))) return "claude-app";
    return "claude-cli";
  }
  if (/jetbrains|intellij/.test(identity)) return "intellij-ai";
  if (identity.includes("chatgpt")) return "chatgpt";
  return "generic";
}

export const sessionTypeLabels: Record<SessionType, string> = {
  "copilot-app": "Copilot app", "copilot-cli": "Copilot CLI", "copilot-ide": "Copilot in IntelliJ", "intellij-ai": "IntelliJ AI",
  "codex-cli": "Codex CLI", "codex-ide": "Codex in IntelliJ", "codex-app": "Codex desktop app", "claude-cli": "Claude CLI", "claude-ide": "Claude in IntelliJ", "claude-app": "Claude Desktop", chatgpt: "ChatGPT", generic: "AI session",
};

export function sessionPhase(session: Session, options: CardOptions = {}): CardPhase {
  if (session.state === "waiting") return options.waitingDimmed && !options.reducedMotion ? "waiting-dim" : "waiting-bright";
  if (session.state === "done") return `done-${doneAttention(session, options.now, options.reducedMotion)!.phase}`;
  return session.state;
}

export function sessionColors(session: Session, options: CardOptions = {}): CardColors {
  const palette = getPalette(options.palette);
  const phase = sessionPhase(session, options);
  return boostedPhaseColors(palette, phase, resolveFlashIntensity(session.metadata, options.flashIntensity));
}

function svg(content: string, title: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 72 72"><title>${escapeXml(title)}</title><g font-family="Arial, Helvetica, sans-serif">${content}</g></svg>`;
}

export function sessionImage(session: Session, keyNumber?: number, options: CardOptions = {}): string {
  const type = sessionType(session);
  const identity = cardIdentities.find((entry) => entry.id === type)!;
  const phase = sessionPhase(session, options);
  const state = cardStates.find((entry) => entry.id === phase)!;
  const number = keyNumber !== undefined && Number.isFinite(keyNumber) ? Math.trunc(keyNumber) : undefined;
  const palette = paletteForSession(session, options);
  return svg(renderCard(identity, state, palette, number, cardIcons), `${sessionTypeLabels[type]}: ${state.label}`);
}

function infoData(session: Session): InfoCardData {
  return { model: session.model, tokensUsed: session.tokensUsed, contextUsedPercent: session.contextUsedPercent, freedom: session.freedom, approval: session.approval };
}

export function infoImage(session: Session, palette?: PaletteId): string {
  const data = infoData(session);
  return svg(renderInfoCard(data, getPalette(palette)), `${session.label}: ${describeInfoCard(data)}`);
}

export function infoSignature(session: Session, palette?: PaletteId): string {
  return JSON.stringify(["info", session.id, getPalette(palette).id, infoData(session)]);
}

export function emptyImage(palette?: PaletteId): string {
  const colors = getPalette(palette);
  return svg(`<rect width="72" height="72" rx="8" fill="${colors.canvas}"/><path d="M27 36h18" stroke="${colors.badge.border}" stroke-width="3" stroke-linecap="round"/>`, "Unused session key");
}

export function appIconName(client: Client): string {
  const identity = `${client.id} ${client.name} ${client.focusTarget.bundleId ?? ""}`.toLowerCase();
  if (identity.includes("chatgpt") || identity.includes("openai")) return "openai";
  if (identity.includes("claude") || identity.includes("anthropic")) return "claude";
  return "app-window";
}

export function appImage(client: Client, keyNumber?: number, palette?: PaletteId): string {
  const number = keyNumber !== undefined && Number.isFinite(keyNumber) ? String(Math.trunc(keyNumber)) : undefined;
  return svg(renderControl(appIconName(client), "APP", getPalette(palette), cardIcons, number), `${client.name}: app detected, sessions not tracked`);
}

export function appSignature(client: Client, keyNumber?: number, palette?: PaletteId): string {
  return JSON.stringify(["app", client.id, appIconName(client), keyNumber, getPalette(palette).id]);
}

export function dashboardImage(palette?: PaletteId): string {
  return svg(renderControl("layout-dashboard", "INFO", getPalette(palette), cardIcons), "Open AI AI Captain dashboard and state details");
}

export function pagerImage(direction: "previous" | "next", page: string, palette?: PaletteId): string {
  return svg(renderControl(direction === "previous" ? "chevron-left" : "chevron-right", direction === "previous" ? "PREV" : "NEXT", getPalette(palette), cardIcons, page), `${direction === "previous" ? "Previous" : "Next"} session page: ${page}`);
}

export function sessionSignature(session: Session, keyNumber?: number, options: CardOptions = {}): string {
  return JSON.stringify([
    session.id,
    sessionType(session),
    keyNumber,
    getPalette(options.palette).id,
    sessionPhase(session, options),
    resolveFlashIntensity(session.metadata, options.flashIntensity),
  ]);
}

function paletteForSession(session: Session, options: CardOptions): CardPalette {
  const palette = getPalette(options.palette);
  const phase = sessionPhase(session, options);
  const colors = boostedPhaseColors(palette, phase, resolveFlashIntensity(session.metadata, options.flashIntensity));
  if (colors === palette.states[phase]) return palette;
  return { ...palette, states: { ...palette.states, [phase]: colors } };
}

function boostedPhaseColors(palette: CardPalette, phase: CardPhase, intensity: FlashIntensity): CardColors {
  return applyFlashIntensity(palette.states[phase], palette, intensity, phase);
}
