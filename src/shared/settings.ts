import { z } from "zod";
import { defaultPaletteId, paletteIds } from "./palette.js";

export const flashIntensityMin = 0;
export const flashIntensityMax = 4;
export const defaultFlashIntensity = 2;
export type FlashIntensity = 0 | 1 | 2 | 3 | 4;

export const settingsSchema = z.object({
  palette: z.enum(paletteIds),
  flashIntensity: z.number().int().min(flashIntensityMin).max(flashIntensityMax),
}).strict();

export const settingsWriteSchema = z.object({
  palette: z.enum(paletteIds),
  flashIntensity: z.number().int().min(flashIntensityMin).max(flashIntensityMax).optional(),
}).strict();

export type HubSettings = z.infer<typeof settingsSchema>;
export type HubSettingsWrite = z.infer<typeof settingsWriteSchema>;

export const defaultSettings: HubSettings = {
  palette: defaultPaletteId,
  flashIntensity: defaultFlashIntensity,
};

export function parseStoredSettings(value: unknown): HubSettings {
  const parsed = settingsWriteSchema.parse(value);
  return {
    palette: parsed.palette,
    flashIntensity: parsed.flashIntensity ?? defaultFlashIntensity,
  };
}
