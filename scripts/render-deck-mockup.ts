/**
 * Makes an animated GIF of a Stream Deck XL with AI AI Captain sessions.
 *
 * The script uses the plugin renderer and the attention timing of the plugin. Thus the mockup shows the real key
 * images and the real WAITING pulse and DONE flash. Run it with `npm run design:mockup`.
 *
 * The script needs `rsvg-convert` to change SVG to PNG. It decodes the PNG frames and writes the GIF without
 * other tools.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import type { Session } from "../src/shared/session.js";
import { getPalette } from "../src/shared/palette.js";
import { dashboardImage, emptyImage, infoImage, infoSignature, sessionImage, sessionSignature, settingControlImage, waitingPulseIntervalMs, type SettingControlKind, type SettingControlState } from "../streamdeck/src/cards.js";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const loopOutputPath = join(repositoryRoot, "docs", "images", "stream-deck-xl-mockup.gif");
const workflowOutputPath = join(repositoryRoot, "docs", "images", "stream-deck-xl-workflow.gif");

// Stream Deck XL geometry.
const columnCount = 8;
const rowCount = 4;
// Columns 0 to 6 hold session keys in rows 0 and 2. Each info key sits directly below its session key.
// Column 7 holds the setting keys and the INFO key.
const sessionColumnCount = 7;
const sessionKeyCount = 14;
const controlColumn = 7;
const controlKeys: readonly { row: number; kind: SettingControlKind | "dashboard" }[] = [
  { row: 0, kind: "info-keys" },
  { row: 1, kind: "theme" },
  { row: 2, kind: "brightness" },
  { row: 3, kind: "dashboard" },
];
const settingState: SettingControlState = { palette: "fjord", flashIntensity: 2, showInfoKeys: true };

// Sample model and usage data for each assistant. The data is not real.
const sampleInfo: Record<string, Pick<Session, "model" | "tokensUsed" | "contextUsedPercent" | "freedom" | "approval">> = {
  "copilot-cli": { model: "gpt-5.5", tokensUsed: 42_000, contextUsedPercent: 21, freedom: "limited", approval: "asks" },
  "copilot-ide": { model: "gpt-5.5", tokensUsed: 96_000, contextUsedPercent: 48, freedom: "limited", approval: "asks" },
  "claude-ide": { model: "claude-sonnet-5-5", tokensUsed: 120_000, contextUsedPercent: 60 },
  "claude-cli": { model: "claude-opus-4", tokensUsed: 172_000, contextUsedPercent: 86 },
  "codex-cli": { model: "gpt-5.5", tokensUsed: 88_000, contextUsedPercent: 44, freedom: "full", approval: "never" },
  "codex-ide": { model: "gpt-5.5", tokensUsed: 31_000, contextUsedPercent: 15, freedom: "limited", approval: "never" },
};

// Mockup geometry in pixels.
const keySize = 96;
const keyGap = 22;
const bezelPadding = 40;
const pagePadding = 28;
const deviceWidth = bezelPadding * 2 + columnCount * keySize + (columnCount - 1) * keyGap;
const deviceHeight = bezelPadding * 2 + rowCount * keySize + (rowCount - 1) * keyGap;
const imageWidth = deviceWidth + pagePadding * 2;
const imageHeight = deviceHeight + pagePadding * 2;

// The loop must contain full WAITING cycles and full DONE flash periods. 12 seconds is the least common multiple.
const loopMilliseconds = 12_000;
const doneFlashPeriodMilliseconds = 500;
const doneFlashMilliseconds = 250;
const frameStepMilliseconds = 50;

const palette = getPalette("fjord");
const completedAt = Date.parse("2026-10-26T12:00:00.000Z");

type SessionStateName = Session["state"];

interface MockSession {
  harness: string;
  state: SessionStateName;
  label: string;
}

const mockSessions: MockSession[] = [
  { harness: "copilot-cli", state: "working", label: "Refactor store" },
  { harness: "claude-ide", state: "waiting", label: "Approve migration" },
  { harness: "codex-ide", state: "done", label: "Write tests" },
  { harness: "copilot-ide", state: "starting", label: "Review plugin" },
  { harness: "claude-cli", state: "failed", label: "Deploy preview" },
  { harness: "codex-cli", state: "unknown", label: "Update docs" },
];

function toSession(mock: MockSession, identifier: string, stateChangedAtMilliseconds: number = completedAt): Session {
  const timestamp = new Date(stateChangedAtMilliseconds).toISOString();
  return {
    id: identifier,
    source: `${mock.harness.split("-")[0] ?? "generic"}-local`,
    harness: mock.harness,
    label: mock.label,
    state: mock.state,
    ...sampleInfo[mock.harness],
    metadata: {},
    createdAt: timestamp,
    updatedAt: timestamp,
    lastActivityAt: timestamp,
    stateChangedAt: timestamp,
  };
}

const loopSessions = mockSessions.map((mock, index) => toSession(mock, `mockup-${String(index + 1)}`));

interface AnimationPhase {
  waitingDimmed: boolean;
  /** The clock time that the key renderer uses to find the DONE flash stage. */
  nowMilliseconds: number;
}

function loopPhaseAt(timeMilliseconds: number): AnimationPhase {
  const waitingDimmed = Math.floor(timeMilliseconds / waitingPulseIntervalMs) % 2 === 1;
  // The DONE age stays in the first flash stage so that the loop repeats.
  const doneAgeMilliseconds = timeMilliseconds % doneFlashPeriodMilliseconds;
  return { waitingDimmed, nowMilliseconds: completedAt + doneAgeMilliseconds };
}

function sessionKeyImage(session: Session | undefined, slot: number, phase: AnimationPhase): string {
  if (session === undefined) return emptyImage(palette.id);
  return sessionImage(session, slot + 1, {
    palette: palette.id,
    waitingDimmed: phase.waitingDimmed,
    now: phase.nowMilliseconds,
  });
}

function infoKeyImage(session: Session | undefined): string {
  if (session === undefined) return emptyImage(palette.id);
  return infoImage(session, palette.id);
}

function controlKeyImage(kind: SettingControlKind | "dashboard"): string {
  if (kind === "dashboard") return dashboardImage(palette.id);
  return settingControlImage(kind, settingState);
}

function cellPosition(row: number, column: number): { x: number; y: number } {
  return {
    x: pagePadding + bezelPadding + column * (keySize + keyGap),
    y: pagePadding + bezelPadding + row * (keySize + keyGap),
  };
}

function placeKey(keyImageSvg: string, row: number, column: number): string {
  const { x, y } = cellPosition(row, column);
  const image = keyImageSvg.replace('width="144" height="144"', `x="${String(x)}" y="${String(y)}" width="${String(keySize)}" height="${String(keySize)}"`);
  const wellInset = 4;
  const well = `<rect x="${String(x - wellInset)}" y="${String(y - wellInset)}" width="${String(keySize + wellInset * 2)}" height="${String(keySize + wellInset * 2)}" rx="14" fill="${palette.canvas}" stroke="${palette.badge.border}" stroke-width="1.5"/>`;
  return well + image;
}

/** Device colors come from the palette tokens. AGENTS.md does not allow new color values outside the tokens. */
function deckSvg(sessions: Session[], phase: AnimationPhase): string {
  const sessionCells = Array.from({ length: sessionKeyCount }, (_, slot) => {
    const session = sessions[slot];
    const row = Math.floor(slot / sessionColumnCount) * 2;
    const column = slot % sessionColumnCount;
    return placeKey(sessionKeyImage(session, slot, phase), row, column) + placeKey(infoKeyImage(session), row + 1, column);
  });
  const controlCells = controlKeys.map(({ row, kind }) => placeKey(controlKeyImage(kind), row, controlColumn));
  const keys = [...sessionCells, ...controlCells].join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${String(imageWidth)}" height="${String(imageHeight)}" viewBox="0 0 ${String(imageWidth)} ${String(imageHeight)}">
<rect width="${String(imageWidth)}" height="${String(imageHeight)}" fill="${palette.canvas}"/>
<rect x="${String(pagePadding)}" y="${String(pagePadding)}" width="${String(deviceWidth)}" height="${String(deviceHeight)}" rx="30" fill="${palette.badge.background}" stroke="${palette.badge.border}" stroke-width="3"/>
${keys}
</svg>`;
}

// ---------------------------------------------------------------------------------------------------------------
// PNG decoding. `rsvg-convert` writes 8-bit RGB or RGBA PNG files without interlacing.
// ---------------------------------------------------------------------------------------------------------------

interface RgbaImage {
  width: number;
  height: number;
  pixels: Uint8Array;
}

function decodePng(file: Buffer): RgbaImage {
  let offset = 8;
  let width = 0;
  let height = 0;
  let bytesPerPixel = 4;
  const compressedChunks: Buffer[] = [];

  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString("ascii", offset + 4, offset + 8);
    const data = file.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      const colorType = data[9];
      const interlace = data[12];
      const rgbColorType = 2;
      const rgbaColorType = 6;
      if (bitDepth !== 8 || (colorType !== rgbColorType && colorType !== rgbaColorType) || interlace !== 0) {
        throw new Error("The PNG must be 8-bit RGB or RGBA without interlacing");
      }
      bytesPerPixel = colorType === rgbColorType ? 3 : 4;
    }
    if (type === "IDAT") compressedChunks.push(data);
    offset += length + 12;
  }

  const filtered = inflateSync(Buffer.concat(compressedChunks));
  const pixels = removePngFilters(filtered, width, height, bytesPerPixel);
  return { width, height, pixels: toRgba(pixels, bytesPerPixel) };
}

function toRgba(pixels: Uint8Array, bytesPerPixel: number): Uint8Array {
  if (bytesPerPixel === 4) return pixels;
  const pixelCount = pixels.length / bytesPerPixel;
  const rgba = new Uint8Array(pixelCount * 4);
  for (let pixel = 0; pixel < pixelCount; pixel++) {
    rgba.set(pixels.subarray(pixel * bytesPerPixel, pixel * bytesPerPixel + 3), pixel * 4);
    rgba[pixel * 4 + 3] = 0xff;
  }
  return rgba;
}

function paethPredictor(left: number, above: number, upperLeft: number): number {
  const estimate = left + above - upperLeft;
  const distanceLeft = Math.abs(estimate - left);
  const distanceAbove = Math.abs(estimate - above);
  const distanceUpperLeft = Math.abs(estimate - upperLeft);
  if (distanceLeft <= distanceAbove && distanceLeft <= distanceUpperLeft) return left;
  if (distanceAbove <= distanceUpperLeft) return above;
  return upperLeft;
}

function removePngFilters(filtered: Buffer, width: number, height: number, bytesPerPixel: number): Uint8Array {
  const rowLength = width * bytesPerPixel;
  const pixels = new Uint8Array(rowLength * height);

  for (let row = 0; row < height; row++) {
    const filterType = filtered[row * (rowLength + 1)] ?? 0;
    const source = row * (rowLength + 1) + 1;
    const target = row * rowLength;
    for (let column = 0; column < rowLength; column++) {
      const raw = filtered[source + column] ?? 0;
      const left = column >= bytesPerPixel ? pixels[target + column - bytesPerPixel] ?? 0 : 0;
      const above = row > 0 ? pixels[target + column - rowLength] ?? 0 : 0;
      const upperLeft = row > 0 && column >= bytesPerPixel ? pixels[target + column - rowLength - bytesPerPixel] ?? 0 : 0;
      const predictions = [0, left, above, Math.floor((left + above) / 2), paethPredictor(left, above, upperLeft)];
      pixels[target + column] = (raw + (predictions[filterType] ?? 0)) & 0xff;
    }
  }
  return pixels;
}

// ---------------------------------------------------------------------------------------------------------------
// Color quantization with median cut. All frames share one palette of 256 colors.
// ---------------------------------------------------------------------------------------------------------------

type Color = [number, number, number];

function collectColors(images: RgbaImage[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const image of images) {
    for (let offset = 0; offset < image.pixels.length; offset += 4) {
      const key = ((image.pixels[offset] ?? 0) << 16) | ((image.pixels[offset + 1] ?? 0) << 8) | (image.pixels[offset + 2] ?? 0);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

interface WeightedColor {
  color: Color;
  count: number;
}

function medianCut(colors: WeightedColor[], colorLimit: number): Color[] {
  const boxes: WeightedColor[][] = [colors];

  while (boxes.length < colorLimit) {
    const index = widestBoxIndex(boxes);
    if (index < 0) break;
    const box = boxes[index] ?? [];
    const channel = widestChannel(box);
    box.sort((first, second) => first.color[channel] - second.color[channel]);
    const middle = weightedMiddle(box);
    boxes.splice(index, 1, box.slice(0, middle), box.slice(middle));
  }

  return boxes.map(averageColor);
}

function channelRange(box: WeightedColor[], channel: number): number {
  const values = box.map((entry) => entry.color[channel] ?? 0);
  return Math.max(...values) - Math.min(...values);
}

function widestChannel(box: WeightedColor[]): 0 | 1 | 2 {
  const ranges = [channelRange(box, 0), channelRange(box, 1), channelRange(box, 2)];
  const widest = Math.max(...ranges);
  if (ranges[0] === widest) return 0;
  if (ranges[1] === widest) return 1;
  return 2;
}

function widestBoxIndex(boxes: WeightedColor[][]): number {
  let bestIndex = -1;
  let bestRange = 0;
  boxes.forEach((box, index) => {
    if (box.length < 2) return;
    const range = channelRange(box, widestChannel(box));
    if (range > bestRange) {
      bestRange = range;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function weightedMiddle(box: WeightedColor[]): number {
  const total = box.reduce((sum, entry) => sum + entry.count, 0);
  let running = 0;
  for (let index = 0; index < box.length; index++) {
    running += box[index]?.count ?? 0;
    if (running >= total / 2) return Math.min(Math.max(index, 1), box.length - 1);
  }
  return Math.floor(box.length / 2);
}

function averageColor(box: WeightedColor[]): Color {
  const total = box.reduce((sum, entry) => sum + entry.count, 0);
  const sums = box.reduce<Color>((sum, entry) => [sum[0] + entry.color[0] * entry.count, sum[1] + entry.color[1] * entry.count, sum[2] + entry.color[2] * entry.count], [0, 0, 0]);
  return [Math.round(sums[0] / total), Math.round(sums[1] / total), Math.round(sums[2] / total)];
}

function nearestColorIndex(color: Color, colorTable: Color[]): number {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  colorTable.forEach((candidate, index) => {
    const distance = (candidate[0] - color[0]) ** 2 + (candidate[1] - color[1]) ** 2 + (candidate[2] - color[2]) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function indexImage(image: RgbaImage, colorTable: Color[], cache: Map<number, number>): Uint8Array {
  const indices = new Uint8Array(image.width * image.height);
  for (let pixel = 0; pixel < indices.length; pixel++) {
    const offset = pixel * 4;
    const key = ((image.pixels[offset] ?? 0) << 16) | ((image.pixels[offset + 1] ?? 0) << 8) | (image.pixels[offset + 2] ?? 0);
    let index = cache.get(key);
    if (index === undefined) {
      index = nearestColorIndex([key >> 16, (key >> 8) & 0xff, key & 0xff], colorTable);
      cache.set(key, index);
    }
    indices[pixel] = index;
  }
  return indices;
}

// ---------------------------------------------------------------------------------------------------------------
// GIF encoding with LZW compression.
// ---------------------------------------------------------------------------------------------------------------

function lzwEncode(indices: Uint8Array, minimumCodeSize: number): Buffer {
  const clearCode = 1 << minimumCodeSize;
  const endCode = clearCode + 1;
  const maximumCode = 4095;
  const output: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;
  let codeSize = minimumCodeSize + 1;
  let nextCode = endCode + 1;
  let dictionary = new Map<number, number>();

  const writeCode = (code: number): void => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      output.push(bitBuffer & 0xff);
      bitBuffer >>= 8;
      bitCount -= 8;
    }
  };

  writeCode(clearCode);
  let prefix = indices[0] ?? 0;
  for (let position = 1; position < indices.length; position++) {
    const symbol = indices[position] ?? 0;
    const key = (prefix << 8) | symbol;
    const existing = dictionary.get(key);
    if (existing !== undefined) {
      prefix = existing;
      continue;
    }
    writeCode(prefix);
    if (nextCode <= maximumCode) {
      dictionary.set(key, nextCode);
      nextCode++;
      // The decoder increases the code size one code later than the encoder adds the entry.
      if (nextCode - 1 === 1 << codeSize && codeSize < 12) codeSize++;
    } else {
      writeCode(clearCode);
      dictionary = new Map<number, number>();
      codeSize = minimumCodeSize + 1;
      nextCode = endCode + 1;
    }
    prefix = symbol;
  }
  writeCode(prefix);
  writeCode(endCode);
  if (bitCount > 0) output.push(bitBuffer & 0xff);
  return Buffer.from(output);
}

function subBlocks(data: Buffer): Buffer {
  const maximumBlockLength = 255;
  const parts: Buffer[] = [];
  for (let offset = 0; offset < data.length; offset += maximumBlockLength) {
    const block = data.subarray(offset, offset + maximumBlockLength);
    parts.push(Buffer.from([block.length]), block);
  }
  parts.push(Buffer.from([0]));
  return Buffer.concat(parts);
}

interface Rectangle {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface GifFrame {
  indices: Uint8Array;
  delayCentiseconds: number;
}

/** Returns the area that changed since the previous frame. Later frames contain only this area. */
function changedArea(previous: Uint8Array | undefined, current: Uint8Array): Rectangle {
  if (previous === undefined) return { left: 0, top: 0, width: imageWidth, height: imageHeight };
  let left = imageWidth;
  let top = imageHeight;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < imageHeight; y++) {
    for (let x = 0; x < imageWidth; x++) {
      const pixel = y * imageWidth + x;
      if (previous[pixel] === current[pixel]) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < 0) return { left: 0, top: 0, width: 1, height: 1 };
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

function cropIndices(indices: Uint8Array, area: Rectangle): Uint8Array {
  const cropped = new Uint8Array(area.width * area.height);
  for (let row = 0; row < area.height; row++) {
    const start = (area.top + row) * imageWidth + area.left;
    cropped.set(indices.subarray(start, start + area.width), row * area.width);
  }
  return cropped;
}

function encodeGif(frames: GifFrame[], colorTable: Color[]): Buffer {
  const colorDepthBits = 8;
  const header = Buffer.from("GIF89a", "ascii");
  const screen = Buffer.alloc(7);
  screen.writeUInt16LE(imageWidth, 0);
  screen.writeUInt16LE(imageHeight, 2);
  screen[4] = 0x80 | ((colorDepthBits - 1) << 4) | (colorDepthBits - 1);
  const globalColorTable = Buffer.alloc(256 * 3);
  colorTable.forEach((color, index) => {
    globalColorTable.set(color, index * 3);
  });
  const loopForever = Buffer.from([0x21, 0xff, 0x0b, ...Buffer.from("NETSCAPE2.0", "ascii"), 0x03, 0x01, 0x00, 0x00, 0x00]);

  const parts: Buffer[] = [header, screen, globalColorTable, loopForever];
  let previous: Uint8Array | undefined;
  for (const frame of frames) {
    const area = changedArea(previous, frame.indices);
    const graphicControl = Buffer.from([0x21, 0xf9, 0x04, 0x04, frame.delayCentiseconds & 0xff, frame.delayCentiseconds >> 8, 0x00, 0x00]);
    const descriptor = Buffer.alloc(10);
    descriptor[0] = 0x2c;
    descriptor.writeUInt16LE(area.left, 1);
    descriptor.writeUInt16LE(area.top, 3);
    descriptor.writeUInt16LE(area.width, 5);
    descriptor.writeUInt16LE(area.height, 7);
    const imageData = lzwEncode(cropIndices(frame.indices, area), colorDepthBits);
    parts.push(graphicControl, descriptor, Buffer.from([colorDepthBits]), subBlocks(imageData));
    previous = frame.indices;
  }
  parts.push(Buffer.from([0x3b]));
  return Buffer.concat(parts);
}

// ---------------------------------------------------------------------------------------------------------------
// Animation timeline.
// ---------------------------------------------------------------------------------------------------------------

interface TimelineStep {
  phaseKey: string;
  sessions: Session[];
  phase: AnimationPhase;
  durationMilliseconds: number;
}

interface TimelineState {
  sessions: Session[];
  phase: AnimationPhase;
}

/** The key is the list of visible key images. Equal keys give equal frames. */
function visiblePhaseKey(sessions: Session[], phase: AnimationPhase): string {
  const options = { palette: palette.id, waitingDimmed: phase.waitingDimmed, now: phase.nowMilliseconds };
  return JSON.stringify(sessions.map((session, index) => [sessionSignature(session, index + 1, options), infoSignature(session, palette.id)]));
}

/** Joins the frame steps that show the same key images into one step. */
function buildTimeline(totalMilliseconds: number, stateAt: (timeMilliseconds: number) => TimelineState): TimelineStep[] {
  const steps: TimelineStep[] = [];
  for (let time = 0; time < totalMilliseconds; time += frameStepMilliseconds) {
    const { sessions, phase } = stateAt(time);
    const phaseKey = visiblePhaseKey(sessions, phase);
    const last = steps.at(-1);
    if (last?.phaseKey === phaseKey) {
      last.durationMilliseconds += frameStepMilliseconds;
      continue;
    }
    steps.push({ phaseKey, sessions, phase, durationMilliseconds: frameStepMilliseconds });
  }
  return steps;
}

function loopTimeline(): TimelineStep[] {
  return buildTimeline(loopMilliseconds, (time) => ({ sessions: loopSessions, phase: loopPhaseAt(time) }));
}

// ---------------------------------------------------------------------------------------------------------------
// Workflow scenario. Sessions start, change state, and end. The clock is real, so the DONE flash slows down.
// ---------------------------------------------------------------------------------------------------------------

type ScenarioAction =
  | { kind: "start"; mock: MockSession }
  | { kind: "change"; state: SessionStateName }
  | { kind: "end" };

interface ScenarioEvent {
  atMilliseconds: number;
  sessionIdentifier: string;
  action: ScenarioAction;
}

// The first session must start within one second. The events below use a script time that begins 1.5 seconds earlier.
const leadTrimMilliseconds = 1500;
const workflowMilliseconds = 44_000 - leadTrimMilliseconds;

function scriptTime(seconds: number): number {
  return seconds * 1000 - leadTrimMilliseconds;
}

function startEvent(seconds: number, sessionIdentifier: string, harness: string, label: string): ScenarioEvent {
  return { atMilliseconds: scriptTime(seconds), sessionIdentifier, action: { kind: "start", mock: { harness, state: "starting", label } } };
}

function changeEvent(seconds: number, sessionIdentifier: string, state: SessionStateName): ScenarioEvent {
  return { atMilliseconds: scriptTime(seconds), sessionIdentifier, action: { kind: "change", state } };
}

function endEvent(seconds: number, sessionIdentifier: string): ScenarioEvent {
  return { atMilliseconds: scriptTime(seconds), sessionIdentifier, action: { kind: "end" } };
}

const workflowEvents: ScenarioEvent[] = [
  startEvent(2, "store", "copilot-cli", "Refactor store"),
  changeEvent(3.5, "store", "working"),
  startEvent(5, "migration", "claude-ide", "Approve migration"),
  changeEvent(6, "migration", "working"),
  startEvent(7, "docs", "codex-cli", "Update docs"),
  changeEvent(8, "docs", "working"),
  changeEvent(9.5, "store", "done"),
  startEvent(11, "plugin", "copilot-ide", "Review plugin"),
  changeEvent(12, "plugin", "working"),
  changeEvent(13, "migration", "waiting"),
  startEvent(14.5, "deploy", "claude-cli", "Deploy preview"),
  changeEvent(15.5, "deploy", "working"),
  changeEvent(15.7, "aged-lint", "working"),
  changeEvent(17, "docs", "failed"),
  changeEvent(18.5, "migration", "working"),
  changeEvent(20, "plugin", "waiting"),
  changeEvent(21, "aged-lint", "done"),
  changeEvent(22, "deploy", "done"),
  changeEvent(23.5, "plugin", "working"),
  startEvent(25, "tests", "codex-ide", "Write tests"),
  changeEvent(26, "tests", "working"),
  changeEvent(29, "tests", "unknown"),
  changeEvent(29.8, "aged-changelog", "working"),
  changeEvent(31, "tests", "working"),
  changeEvent(33, "migration", "failed"),
  changeEvent(34.5, "plugin", "done"),
  endEvent(36, "docs"),
  changeEvent(36.5, "aged-changelog", "done"),
  endEvent(37, "migration"),
  changeEvent(39, "tests", "done"),
];

// These sessions finished more than ten minutes before the animation starts. Their DONE keys are aged and steady.
const agedDoneMinutes = 60_000;
const initialSessions: Session[] = [
  toSession({ harness: "claude-cli", state: "done", label: "Fix lint errors" }, "aged-lint", completedAt - 12 * agedDoneMinutes),
  toSession({ harness: "codex-ide", state: "done", label: "Update changelog" }, "aged-changelog", completedAt - 45 * agedDoneMinutes),
  toSession({ harness: "copilot-cli", state: "done", label: "Rename modules" }, "aged-modules", completedAt - 180 * agedDoneMinutes),
];

function applyEvent(sessions: Session[], event: ScenarioEvent): Session[] {
  const eventTime = completedAt + event.atMilliseconds;
  const { action, sessionIdentifier } = event;
  if (action.kind === "start") return [...sessions, toSession(action.mock, sessionIdentifier, eventTime)];
  if (action.kind === "end") return sessions.filter((session) => session.id !== sessionIdentifier);

  const timestamp = new Date(eventTime).toISOString();
  return sessions.map((session) => (session.id === sessionIdentifier ? { ...session, state: action.state, stateChangedAt: timestamp, updatedAt: timestamp, lastActivityAt: timestamp } : session));
}

function workflowStateAt(timeMilliseconds: number): TimelineState {
  const sessions = workflowEvents.filter((event) => event.atMilliseconds <= timeMilliseconds).reduce(applyEvent, initialSessions);
  const waitingDimmed = Math.floor(timeMilliseconds / waitingPulseIntervalMs) % 2 === 1;
  return { sessions, phase: { waitingDimmed, nowMilliseconds: completedAt + timeMilliseconds } };
}

function workflowTimeline(): TimelineStep[] {
  return buildTimeline(workflowMilliseconds, workflowStateAt);
}

function renderPhaseImages(steps: TimelineStep[], workDirectory: string): Map<string, RgbaImage> {
  const images = new Map<string, RgbaImage>();
  for (const step of steps) {
    if (images.has(step.phaseKey)) continue;
    const name = `frame-${String(images.size)}`;
    const svgPath = join(workDirectory, `${name}.svg`);
    const pngPath = join(workDirectory, `${name}.png`);
    writeFileSync(svgPath, deckSvg(step.sessions, step.phase));
    execFileSync("rsvg-convert", [svgPath, "-o", pngPath]);
    images.set(step.phaseKey, decodePng(readFileSync(pngPath)));
  }
  return images;
}

function writeAnimation(steps: TimelineStep[], outputPath: string): void {
  const workDirectory = mkdtempSync(join(tmpdir(), "deck-mockup-"));
  try {
    const images = renderPhaseImages(steps, workDirectory);
    const colorCounts = collectColors([...images.values()]);
    const weightedColors = [...colorCounts].map(([key, count]): WeightedColor => ({ color: [key >> 16, (key >> 8) & 0xff, key & 0xff], count }));
    const colorTable = medianCut(weightedColors, 256);
    const cache = new Map<number, number>();
    const indexedImages = new Map([...images].map(([key, image]) => [key, indexImage(image, colorTable, cache)]));

    const frames = steps.map((step): GifFrame => ({
      indices: indexedImages.get(step.phaseKey) ?? new Uint8Array(),
      delayCentiseconds: Math.round(step.durationMilliseconds / 10),
    }));
    writeFileSync(outputPath, encodeGif(frames, colorTable));
    console.info(`Wrote ${outputPath}: ${String(frames.length)} frames, ${String(imageWidth)} x ${String(imageHeight)} pixels, ${String(colorCounts.size)} source colors.`);
  } finally {
    rmSync(workDirectory, { recursive: true, force: true });
  }
}

writeAnimation(loopTimeline(), loopOutputPath);
writeAnimation(workflowTimeline(), workflowOutputPath);
