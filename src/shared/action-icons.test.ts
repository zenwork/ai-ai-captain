import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { actionIconSymbols, renderActionIcon, type ActionIconId } from "./card-design.js";
import { cardIcons } from "./card-assets.js";

describe("Stream Deck action icons", () => {
  const manifest = JSON.parse(readFileSync(new URL("../../streamdeck/manifest.json", import.meta.url), "utf8")) as {
    Actions: { UUID: string; Icon: string; States: { Image: string }[] }[];
  };

  it("has an icon and a key image for each action in the manifest", () => {
    for (const action of manifest.Actions) {
      const id = action.UUID.replace("com.local.ai-ai-captain.", "");
      expect(Object.keys(actionIconSymbols)).toContain(id);
      expect(action.Icon).toBe(`imgs/actions/${id}`);
      expect(action.States[0].Image).toBe(`imgs/keys/${id}`);
    }
  });

  it("draws each icon as a 20 × 20 SVG without external content", () => {
    for (const id of Object.keys(actionIconSymbols) as ActionIconId[]) {
      const svg = renderActionIcon(id, cardIcons);
      expect(svg).toContain('viewBox="0 0 20 20"');
      expect(svg).not.toMatch(/<image|<script|href=/);
    }
  });
});
