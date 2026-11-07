/**
 * Makes the Marketplace listing images: the icon (288 x 288) and the thumbnail (1920 x 960).
 *
 * The thumbnail uses the real key images of the plugin renderer and the Fjord palette.
 * Run it with `npm run design:marketplace`. The script needs `rsvg-convert` to make the PNG files.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getPalette } from "../../src/shared/palette.js";
import { emptyImage, infoImage, sessionImage } from "../../streamdeck/src/cards.js";
import { controlKeyImage, controlKeys, placeKey, sampleSession, type KeyWell, type SampleSession } from "./deck-scene.js";

const repositoryRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const outputDirectory = join(repositoryRoot, "docs", "marketplace");
mkdirSync(outputDirectory, { recursive: true });

const palette = getPalette("fjord");
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
      return `<path d="M${point(start)} A${String(radius)} ${String(radius)} 0 0 1 ${point(end)}" fill="none" stroke="${palette.states[name].accent}" stroke-width="22" stroke-linecap="round"/>`;
    })
    .join("");
  const working = palette.states.working;
  const accent = working.accent;
  const play = `<path d="M${String(144 - 27)} ${String(144 - 38)} L${String(144 + 32)} 144 L${String(144 - 27)} ${String(144 + 38)} Z" fill="${accent}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="288" height="288" viewBox="0 0 288 288"><rect width="288" height="288" fill="${palette.canvas}"/><rect x="8" y="8" width="272" height="272" rx="56" fill="${palette.badge.background}"/>${arcs}<circle cx="144" cy="144" r="52" fill="${working.background}" stroke="${accent}" stroke-width="8"/>${play}</svg>`;
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

const samples: SampleSession[] = [
  {
    harness: "codex-cli",
    state: "working",
    label: "Refactor store",
  },
  { harness: "claude-ide", state: "waiting", label: "Approve migration" },
  {
    harness: "copilot-cli",
    state: "done",
    label: "Write tests",
  },
  { harness: "claude-cli", state: "working", label: "Deploy preview" },
  {
    harness: "codex-ide",
    state: "starting",
    label: "Review plugin",
  },
  { harness: "claude-app", state: "done", label: "Plan release" },
  {
    harness: "copilot-ide",
    state: "failed",
    label: "Fix build",
  },
  {
    harness: "codex-app",
    state: "waiting",
    label: "Update docs",
  },
  { harness: "chatgpt", state: "working", label: "Draft notes" },
  { harness: "copilot-app", state: "unknown", label: "Check logs" },
];

const keyWell: KeyWell = { size: keySize, inset: 7, radius: 22, strokeWidth: 2 };

function placeGridKey(keyImage: string, row: number, column: number): string {
  return placeKey(keyImage, gridX + column * (keySize + keyGap), gridY + row * (keySize + keyGap), keyWell, palette);
}

function thumbnailSvg(): string {
  const sessions = samples.map((sample, index) => sampleSession(sample, `marketplace-${String(index + 1)}`, timestamp));
  const sessionCells = sessions.map((session, slot) => {
    const row = Math.floor(slot / sessionColumnCount) * 2;
    const column = slot % sessionColumnCount;
    return (
      placeGridKey(sessionImage(session, slot + 1, { palette: palette.id }), row, column) +
      (session.model === undefined ? placeGridKey(emptyImage(palette.id), row + 1, column) : placeGridKey(infoImage(session, palette.id), row + 1, column))
    );
  });
  const controlCells = controlKeys.map(({ row, kind }) => placeGridKey(controlKeyImage(kind, palette), row, columnCount - 1));
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
