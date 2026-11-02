import { defaultPaletteId, designPalettes } from "./card-assets.js";
import { findById } from "./card-design.js";

export { defaultPaletteId };
export const palettes = designPalettes;
export type Palette = (typeof palettes)[number];
export type PaletteId = Palette["id"];
export const paletteIds = palettes.map((palette) => palette.id);

export function isPaletteId(value: unknown): value is PaletteId {
  return palettes.some((palette) => palette.id === value);
}

export function getPalette(id: unknown = defaultPaletteId): Palette {
  return palettes.find((palette) => palette.id === id) ?? findById(palettes, defaultPaletteId, "palette");
}
