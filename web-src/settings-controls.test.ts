import { describe, expect, it } from "vitest";
import { createSettingsPayload, flashIntensityChoices } from "./settings-controls.js";

describe("dashboard settings controls", () => {
  it("offers the documented flash intensity levels", () => {
    expect(flashIntensityChoices).toEqual([
      { value: 0, label: "Palette colors" },
      { value: 1, label: "Increased contrast" },
      { value: 2, label: "Default stronger flash" },
      { value: 3, label: "High contrast" },
      { value: 4, label: "Full color range" },
    ]);
  });

  it("keeps palette and flash intensity in the same save payload", () => {
    expect(createSettingsPayload("signal", 4, false)).toEqual({ palette: "signal", flashIntensity: 4, showInfoKeys: false });
  });
});
