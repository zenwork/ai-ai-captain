import type { CardColors, CardPalette } from "./card-design.js";
import { defaultFlashIntensity, type FlashIntensity } from "./settings.js";

export const flashIntensityMixAmounts = [0, 0.45, 0.7, 0.85, 1] as const;

const flashIntensityPattern = /^[0-4]$/;
const hexColorPattern = /^#([0-9A-Fa-f]{6})$/;

interface RgbColor {
  red: number;
  green: number;
  blue: number;
}

export function isFlashIntensity(value: unknown): value is FlashIntensity {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 4;
}

export function parseFlashIntensity(value: unknown): FlashIntensity | undefined {
  if (isFlashIntensity(value)) return value;
  if (typeof value !== "string" || !flashIntensityPattern.test(value)) return undefined;
  const intensity = Number(value);
  if (!isFlashIntensity(intensity)) return undefined;
  return intensity;
}

export function resolveFlashIntensity(metadata: Record<string, string> | undefined, fallback: number | undefined): FlashIntensity {
  return parseFlashIntensity(metadata?.flashIntensity) ?? parseFlashIntensity(fallback) ?? defaultFlashIntensity;
}

export function applyFlashIntensity(colors: CardColors, palette: CardPalette, intensity: FlashIntensity, phase: string): CardColors {
  const amount = flashIntensityMixAmounts[intensity];
  if (amount === 0) return colors;
  if (phase === "waiting-dim") {
    return {
      ...colors,
      background: mixHex(colors.background, darkerColor(colors.background, palette.canvas), amount),
    };
  }
  if (phase === "done-dim") {
    const agedBackground = palette.states["done-aged"].background;
    return {
      ...colors,
      background: mixHex(colors.background, darkerColor(colors.background, agedBackground), amount),
    };
  }
  if (phase !== "waiting-bright" && phase !== "done-bright") return colors;
  const lightToken = lighterColor(palette.foreground, palette.canvas);
  const brightFill = lighterColor(colors.background, colors.accent);
  return {
    background: mixHex(colors.background, brightFill, amount),
    accent: mixHex(colors.accent, lighterColor(colors.accent, lightToken), amount),
    foreground: colors.foreground,
    ink: colors.ink,
  };
}

function lighterColor(first: string, second: string): string {
  return relativeLuminance(first) >= relativeLuminance(second) ? first : second;
}

function darkerColor(first: string, second: string): string {
  return relativeLuminance(first) <= relativeLuminance(second) ? first : second;
}

function mixHex(from: string, to: string, amount: number): string {
  const start = parseHexColor(from);
  const end = parseHexColor(to);
  if (!start || !end || amount <= 0) return from;
  if (amount >= 1) return to;
  return formatHexColor({
    red: mixChannel(start.red, end.red, amount),
    green: mixChannel(start.green, end.green, amount),
    blue: mixChannel(start.blue, end.blue, amount),
  });
}

function mixChannel(start: number, end: number, amount: number): number {
  return Math.round(start + (end - start) * amount);
}

function parseHexColor(color: string): RgbColor | undefined {
  const match = hexColorPattern.exec(color);
  if (!match) return undefined;
  const value = Number.parseInt(match[1], 16);
  return {
    red: (value >> 16) & 255,
    green: (value >> 8) & 255,
    blue: value & 255,
  };
}

function formatHexColor(color: RgbColor): string {
  return `#${[color.red, color.green, color.blue].map(hexChannel).join("")}`;
}

function hexChannel(value: number): string {
  return value.toString(16).padStart(2, "0").toUpperCase();
}

function relativeLuminance(color: string): number {
  const parsed = parseHexColor(color);
  if (!parsed) return 0;
  return linearized(parsed.red) * 0.2126 + linearized(parsed.green) * 0.7152 + linearized(parsed.blue) * 0.0722;
}

function linearized(value: number): number {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}
