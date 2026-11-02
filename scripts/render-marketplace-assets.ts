/**
 * Makes the Marketplace listing images: the icon (288 x 288) and the thumbnail (1920 x 960).
 *
 * The thumbnail uses the real key images of the plugin renderer and the Fjord palette.
 * Run it with `npm run design:marketplace`. The script needs `rsvg-convert` to make the PNG files.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Session } from "../src/shared/session.js";
import { getPalette } from "../src/shared/palette.js";
import {
  dashboardImage,
  emptyImage,
  infoImage,
  sessionImage,
  settingControlImage,
  type SettingControlKind,
  type SettingControlState,
} from "../streamdeck/src/cards.js";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDirectory = join(repositoryRoot, "docs", "marketplace");
mkdirSync(outputDirectory, { recursive: true });

const palette = getPalette("fjord");
const tokens = JSON.parse(readFileSync(join(repositoryRoot, "docs", "design", "palettes", "tokens.json"), "utf8")) as {
  palettes: { id: string; states: Record<string, { accent: string; background: string }> }[];
};
const fjordStates = tokens.palettes.find((entry) => entry.id === "fjord")?.states;
if (fjordStates === undefined) throw new Error("The fjord palette is missing from tokens.json");
const fontFamily = 'font-family="Helvetica, Arial, sans-serif"';

// Icon B: a ring in three state colors around a play symbol.
const ringStates = ["working", "waiting-bright", "done-bright"] as const;
function iconSvg(): string {
  const arcs = ringStates
    .map((name, index) => {
      const radius = 98;
      const start = ((index * 120 - 80) * Math.PI) / 180;
      const end = ((index * 120 + 30) * Math.PI) / 180;
      const point = (angle: number): string => `${String(144 + radius * Math.cos(angle))} ${String(144 + radius * Math.sin(angle))}`;
      return `<path d="M${point(start)} A${String(radius)} ${String(radius)} 0 0 1 ${point(end)}" fill="none" stroke="${fjordStates[name]?.accent ?? ""}" stroke-width="22" stroke-linecap="round"/>`;
    })
    .join("");
  const working = fjordStates.working;
  const accent = working?.accent ?? "";
  const play = `<path d="M${String(144 - 27)} ${String(144 - 38)} L${String(144 + 32)} 144 L${String(144 - 27)} ${String(144 + 38)} Z" fill="${accent}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="288" height="288" viewBox="0 0 288 288"><rect width="288" height="288" fill="${palette.canvas}"/><rect x="8" y="8" width="272" height="272" rx="56" fill="${palette.badge.background}"/>${arcs}<circle cx="144" cy="144" r="52" fill="${working?.background ?? ""}" stroke="${accent}" stroke-width="8"/>${play}</svg>`;
}

// Thumbnail: the title and a Stream Deck XL with real key images.
const columnCount = 6;
const sessionColumnCount = 5;
const keySize = 170;
const keyGap = 24;
const panelX = 560;
const panelY = 70;
const panelWidth = 1300;
const panelHeight = 820;
const gridWidth = columnCount * keySize + (columnCount - 1) * keyGap;
const gridHeight = 4 * keySize + 3 * keyGap;
const gridX = panelX + (panelWidth - gridWidth) / 2;
const gridY = panelY + (panelHeight - gridHeight) / 2;
const timestamp = "2026-10-26T12:00:00.000Z";

interface Sample {
  harness: string;
  state: Session["state"];
  label: string;
  info: Partial<Pick<Session, "model" | "tokensUsed" | "contextUsedPercent" | "freedom" | "approval">>;
}

const samples: Sample[] = [
  {
    harness: "codex-cli",
    state: "working",
    label: "Refactor store",
    info: { model: "gpt-5.5", tokensUsed: 88_000, contextUsedPercent: 44, freedom: "full", approval: "never" },
  },
  { harness: "claude-ide", state: "waiting", label: "Approve migration", info: { model: "claude-sonnet-5-5", tokensUsed: 120_000, contextUsedPercent: 60 } },
  {
    harness: "copilot-cli",
    state: "done",
    label: "Write tests",
    info: { model: "gpt-5.5", tokensUsed: 42_000, contextUsedPercent: 21, freedom: "limited", approval: "asks" },
  },
  { harness: "claude-cli", state: "working", label: "Deploy preview", info: { model: "claude-opus-4", tokensUsed: 172_000, contextUsedPercent: 86 } },
  {
    harness: "codex-ide",
    state: "starting",
    label: "Review plugin",
    info: { model: "gpt-5.5", tokensUsed: 31_000, contextUsedPercent: 15, freedom: "limited", approval: "never" },
  },
  { harness: "claude-app", state: "done", label: "Plan release", info: { model: "claude-haiku-4-5", tokensUsed: 54_000, contextUsedPercent: 27 } },
  {
    harness: "copilot-ide",
    state: "failed",
    label: "Fix build",
    info: { model: "gpt-5.5", tokensUsed: 96_000, contextUsedPercent: 48, freedom: "limited", approval: "asks" },
  },
  {
    harness: "codex-app",
    state: "waiting",
    label: "Update docs",
    info: { model: "gpt-5.5", tokensUsed: 140_000, contextUsedPercent: 70, freedom: "full", approval: "asks" },
  },
  { harness: "chatgpt", state: "working", label: "Draft notes", info: {} },
  { harness: "copilot-app", state: "unknown", label: "Check logs", info: {} },
];

function toSession(sample: Sample, index: number): Session {
  return {
    id: `marketplace-${String(index + 1)}`,
    source: `${sample.harness.split("-")[0] ?? "generic"}-local`,
    harness: sample.harness,
    label: sample.label,
    state: sample.state,
    ...sample.info,
    metadata: {},
    createdAt: timestamp,
    updatedAt: timestamp,
    lastActivityAt: timestamp,
    stateChangedAt: timestamp,
  };
}

const settingState: SettingControlState = { palette: "fjord", flashIntensity: 2, showInfoKeys: true };
const controlKeys: { row: number; kind: SettingControlKind | "dashboard" }[] = [
  { row: 0, kind: "info-keys" },
  { row: 1, kind: "theme" },
  { row: 2, kind: "brightness" },
  { row: 3, kind: "dashboard" },
];

function placeKey(keyImage: string, row: number, column: number): string {
  const x = gridX + column * (keySize + keyGap);
  const y = gridY + row * (keySize + keyGap);
  const image = keyImage.replace('width="144" height="144"', `x="${String(x)}" y="${String(y)}" width="${String(keySize)}" height="${String(keySize)}"`);
  const inset = 7;
  const well = `<rect x="${String(x - inset)}" y="${String(y - inset)}" width="${String(keySize + inset * 2)}" height="${String(keySize + inset * 2)}" rx="22" fill="${palette.canvas}" stroke="${palette.badge.border}" stroke-width="2"/>`;
  return well + image;
}

function thumbnailSvg(): string {
  const sessions = samples.map(toSession);
  const sessionCells = sessions.map((session, slot) => {
    const row = Math.floor(slot / sessionColumnCount) * 2;
    const column = slot % sessionColumnCount;
    return (
      placeKey(sessionImage(session, slot + 1, { palette: palette.id }), row, column) +
      (session.model === undefined ? placeKey(emptyImage(palette.id), row + 1, column) : placeKey(infoImage(session, palette.id), row + 1, column))
    );
  });
  const controlCells = controlKeys.map(({ row, kind }) =>
    placeKey(kind === "dashboard" ? dashboardImage(palette.id) : settingControlImage(kind, settingState), row, columnCount - 1),
  );
  const title = `<text x="70" y="390" ${fontFamily} font-size="96" font-weight="800" fill="${palette.foreground}">AI AI</text><text x="70" y="500" ${fontFamily} font-size="96" font-weight="800" fill="${palette.foreground}">Captain</text><text x="70" y="570" ${fontFamily} font-size="34" fill="${palette.muted}">Every AI session</text><text x="70" y="615" ${fontFamily} font-size="34" fill="${palette.muted}">on your Stream Deck</text>`;
  const panel = `<rect x="${String(panelX)}" y="${String(panelY)}" width="${String(panelWidth)}" height="${String(panelHeight)}" rx="60" fill="${palette.badge.background}" stroke="${palette.badge.border}" stroke-width="6"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="960" viewBox="0 0 1920 960"><rect width="1920" height="960" fill="${palette.canvas}"/>${title}${panel}${[...sessionCells, ...controlCells].join("")}</svg>`;
}

const files: [string, string, number, number][] = [
  ["icon-b-ring", iconSvg(), 288, 288],
  ["thumbnail-c-deck", thumbnailSvg(), 1920, 960],
];
for (const [name, content, width, height] of files) {
  const svgPath = join(outputDirectory, `${name}.svg`);
  writeFileSync(svgPath, content);
  execFileSync("rsvg-convert", ["-w", String(width), "-h", String(height), svgPath, "-o", join(outputDirectory, `${name}.png`)]);
}
