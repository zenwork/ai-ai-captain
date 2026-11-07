/**
 * Sample data and key placement that the deck mockup and the Marketplace images share.
 * Thus both images show the same sessions, the same setting keys, and the same key wells.
 */
import type { Palette } from "../../src/shared/palette.js";
import type { Session } from "../../src/shared/session.js";
import { dashboardImage, settingControlImage, type SettingControlKind, type SettingControlState } from "../../streamdeck/src/cards.js";

/** The keys of the control column, from the top row to the bottom row. */
export const controlKeys: readonly { row: number; kind: SettingControlKind | "dashboard" }[] = [
  { row: 0, kind: "info-keys" },
  { row: 1, kind: "theme" },
  { row: 2, kind: "brightness" },
  { row: 3, kind: "dashboard" },
];

export const settingState: SettingControlState = { palette: "fjord", flashIntensity: 2, showInfoKeys: true };

type SampleInfo = Partial<Pick<Session, "model" | "tokensUsed" | "contextUsedPercent" | "freedom" | "approval">>;

// Sample model and usage data for each harness. The data is not real.
const sampleInfo: Partial<Record<string, SampleInfo>> = {
  "copilot-cli": { model: "gpt-5.5", tokensUsed: 42_000, contextUsedPercent: 21, freedom: "limited", approval: "asks" },
  "copilot-ide": { model: "gpt-5.5", tokensUsed: 96_000, contextUsedPercent: 48, freedom: "limited", approval: "asks" },
  "claude-ide": { model: "claude-sonnet-5-5", tokensUsed: 120_000, contextUsedPercent: 60 },
  "claude-cli": { model: "claude-opus-4", tokensUsed: 172_000, contextUsedPercent: 86 },
  "claude-app": { model: "claude-haiku-4-5", tokensUsed: 54_000, contextUsedPercent: 27 },
  "codex-cli": { model: "gpt-5.5", tokensUsed: 88_000, contextUsedPercent: 44, freedom: "full", approval: "never" },
  "codex-ide": { model: "gpt-5.5", tokensUsed: 31_000, contextUsedPercent: 15, freedom: "limited", approval: "never" },
  "codex-app": { model: "gpt-5.5", tokensUsed: 140_000, contextUsedPercent: 70, freedom: "full", approval: "asks" },
};

export interface SampleSession {
  harness: string;
  state: Session["state"];
  label: string;
}

/** Makes a session with the sample data of its harness. All times are the state change time. */
export function sampleSession(sample: SampleSession, id: string, stateChangedAt: string): Session {
  return {
    id,
    source: `${sample.harness.split("-")[0] ?? "generic"}-local`,
    harness: sample.harness,
    label: sample.label,
    state: sample.state,
    ...sampleInfo[sample.harness],
    metadata: {},
    createdAt: stateChangedAt,
    updatedAt: stateChangedAt,
    lastActivityAt: stateChangedAt,
    stateChangedAt,
  };
}

export function controlKeyImage(kind: SettingControlKind | "dashboard", palette: Palette): string {
  if (kind === "dashboard") return dashboardImage(palette.id);
  return settingControlImage(kind, settingState);
}

export interface KeyWell {
  size: number;
  inset: number;
  radius: number;
  strokeWidth: number;
}

/** Puts a 144-pixel key image at a position, with a key well around it. */
export function placeKey(keyImageSvg: string, x: number, y: number, well: KeyWell, palette: Palette): string {
  const image = keyImageSvg.replace('width="144" height="144"', `x="${String(x)}" y="${String(y)}" width="${String(well.size)}" height="${String(well.size)}"`);
  const wellSize = well.size + well.inset * 2;
  const wellRect = `<rect x="${String(x - well.inset)}" y="${String(y - well.inset)}" width="${String(wellSize)}" height="${String(wellSize)}" rx="${String(well.radius)}" fill="${palette.canvas}" stroke="${palette.badge.border}" stroke-width="${String(well.strokeWidth)}"/>`;
  return wellRect + image;
}
