import { z } from "zod";
import { defaultPaletteId, paletteIds } from "./palette.js";

export const settingsSchema = z.object({ palette: z.enum(paletteIds) }).strict();
export type HubSettings = z.infer<typeof settingsSchema>;
export const defaultSettings: HubSettings = { palette: defaultPaletteId };
