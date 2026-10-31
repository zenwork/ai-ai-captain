import type { FlashIntensity, HubSettings } from "../src/shared/settings.js";
import type { PaletteId } from "../src/shared/palette.js";

export const flashIntensityChoices = [
  { value: 0, label: "Palette colors" },
  { value: 1, label: "Increased contrast" },
  { value: 2, label: "Default stronger flash" },
  { value: 3, label: "High contrast" },
  { value: 4, label: "Full color range" },
] as const satisfies readonly { value: FlashIntensity; label: string }[];

export function createSettingsPayload(palette: PaletteId, flashIntensity: FlashIntensity, showInfoKeys: boolean): HubSettings {
  return { palette, flashIntensity, showInfoKeys };
}
