import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dashboardImage, emptyImage, pagerImage, sessionColors, sessionImage, sessionSignature, sessionType, waitingPulseIntervalMs } from "../../streamdeck/src/cards.js";
import { cardIdentities, cardStates, renderCard } from "../shared/card-design.js";
import { cardIcons } from "../shared/card-assets.js";
import { defaultPaletteId, getPalette, palettes } from "../shared/palette.js";
import type { Session } from "../shared/session.js";
import { svgDataUri } from "../../streamdeck/src/images.js";

const session: Session = {
  id: "copilot:first-session", source: "copilot-local", harness: "copilot-ide", label: "Project", state: "working", project: "/projects/example", model: "gpt-6.1-sol",
  metadata: { sessionId: "first-session", host: "IntelliJ IDEA" }, createdAt: "2026-10-25T12:00:00.000Z", updatedAt: "2026-10-25T12:00:00.000Z", lastActivityAt: "2026-10-25T12:00:00.000Z",
};

function luminance(color: string): number {
  const channels = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16) / 255).map((channel) => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}

function contrast(first: string, second: string): number {
  const levels = [luminance(first), luminance(second)].sort((left, right) => left - right);
  return (levels[1] + .05) / (levels[0] + .05);
}

describe("Stream Deck design implementation", () => {
  it("uses the exact default reference tile, symbols, host badge, and typography", () => {
    const identity = cardIdentities.find((entry) => entry.id === "copilot-ide")!;
    const state = cardStates.find((entry) => entry.id === "working")!;
    const tile = renderCard(identity, state, getPalette(), 2, cardIcons);
    const reference = readFileSync(new URL("../../docs/design/palettes/default.svg", import.meta.url), "utf8");
    expect(defaultPaletteId).toBe("fjord");
    expect(reference).toContain(tile);
    expect(sessionImage(session, 2)).toContain(tile);
    expect(tile).toContain('transform="translate(45.5 0) scale(.8 1)"');
    expect(tile).toContain('x="3" y="51" width="66" height="18"');
  });

  it("renders every identity and phase identically to its palette reference", () => {
    for (const palette of palettes) {
      const reference = readFileSync(new URL(`../../docs/design/palettes/${palette.id}.svg`, import.meta.url), "utf8");
      for (const [index, identity] of cardIdentities.entries()) {
        for (const state of cardStates) {
          const tile = renderCard(identity, state, palette, index + 1, cardIcons);
          expect(reference).toContain(tile);
          expect(tile).not.toMatch(/<svg\b|<use|\bid=|<script|href=|currentColor/);
          const colors = palette.states[state.id];
          expect(contrast(colors.ink, colors.accent)).toBeGreaterThanOrEqual(palette.minimumTextContrast);
          expect(contrast(colors.foreground, colors.background)).toBeGreaterThanOrEqual(palette.minimumTextContrast);
        }
      }
    }
  });

  it("uses full state wording and no unreadable session details", () => {
    for (const [state, label] of [["starting", "STARTING"], ["working", "WORKING"], ["waiting", "WAITING"], ["done", "DONE"], ["failed", "FAILED"], ["unknown", "UNK"]] as const) {
      const image = sessionImage({ ...session, state }, 1);
      expect(image).toContain(`>${label}<`);
      expect(image).toContain(">IJ<");
      expect(image).toContain(">1<");
      expect(image).not.toMatch(/Project|example|first-session|gpt-6|>RUN<|>RUNNING<|>START<|>WAIT<|>FAIL</);
    }
  });

  it("encodes generated SVGs as image data rather than raw markup", () => {
    const svg = sessionImage(session, 1);
    const image = svgDataUri(svg);
    expect(image).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(Buffer.from(image.split(",")[1], "base64").toString("utf8")).toBe(svg);
  });

  it("uses a single SVG viewport and explicit icon colors for Stream Deck compatibility", () => {
    for (const palette of palettes) {
      const images = [sessionImage(session, 1, { palette: palette.id }), dashboardImage(palette.id), pagerImage("next", "1/2", palette.id), emptyImage(palette.id)];
      for (const image of images) {
        expect([...image.matchAll(/<svg\b/g)]).toHaveLength(1);
        expect(image).not.toMatch(/currentColor|<symbol|<use/);
      }
      expect(images[0]).toContain('transform="translate(21.5 19) scale(1.2083333333333333)"');
      expect(images[0]).toContain(`fill="${palette.states.working.foreground}"`);
      expect(images[0]).toContain(`stroke="${palette.states.working.ink}"`);
      expect(images[1]).toContain(`stroke="${palette.controls.foreground}"`);
    }
  });

  it("slowly pulses only WAITING with exact bright/dim palette colors and respects reduced motion", () => {
    const waiting = { ...session, state: "waiting" as const };
    expect(waitingPulseIntervalMs).toBe(1200);
    for (const palette of palettes) {
      expect(sessionColors(waiting, { palette: palette.id }).accent).toBe(palette.states["waiting-bright"].accent);
      expect(sessionColors(waiting, { palette: palette.id, waitingDimmed: true }).accent).toBe(palette.states["waiting-dim"].accent);
      expect(sessionSignature(waiting, 1, { palette: palette.id })).not.toBe(sessionSignature(waiting, 1, { palette: palette.id, waitingDimmed: true }));
      expect(sessionColors(waiting, { palette: palette.id, waitingDimmed: true, reducedMotion: true }).accent).toBe(palette.states["waiting-bright"].accent);
    }
    for (const state of ["starting", "working", "done", "failed", "unknown"] as const) {
      expect(sessionImage({ ...session, state }, 1, { waitingDimmed: true })).toBe(sessionImage({ ...session, state }, 1, { waitingDimmed: false }));
    }
  });

  it("keeps DONE phases readable and ordered without resetting completion age on palette changes", () => {
    const completedAt = Date.parse(session.lastActivityAt);
    const completed = { ...session, state: "done" as const, stateChangedAt: session.lastActivityAt };
    for (const palette of palettes) {
      const frames = [0, 250, 600_000].map((age) => ({ palette: palette.id, now: completedAt + age }));
      const colors = frames.map((options) => sessionColors(completed, options));
      expect(colors.map((color) => color.accent)).toEqual([palette.states["done-bright"].accent, palette.states["done-dim"].accent, palette.states["done-aged"].accent]);
      expect(luminance(colors[0].accent)).toBeGreaterThan(luminance(colors[1].accent));
      expect(luminance(colors[1].accent)).toBeGreaterThan(luminance(colors[2].accent));
      expect(new Set(frames.map((options) => sessionSignature(completed, 1, options))).size).toBe(3);
      for (const options of frames) expect(sessionImage(completed, 1, options)).toContain(">DONE<");
    }
    expect(completed.stateChangedAt).toBe(session.lastActivityAt);
  });

  it("changes every key type with the palette and caches metadata-only updates", () => {
    expect(new Set(palettes.map((palette) => sessionImage(session, 1, { palette: palette.id }))).size).toBe(5);
    expect(new Set(palettes.map((palette) => sessionSignature(session, 1, { palette: palette.id }))).size).toBe(5);
    expect(new Set(palettes.map((palette) => emptyImage(palette.id))).size).toBe(5);
    expect(new Set(palettes.map((palette) => dashboardImage(palette.id))).size).toBe(5);
    expect(new Set(palettes.map((palette) => pagerImage("next", "1/2", palette.id))).size).toBe(5);
    expect(sessionSignature({ ...session, label: "Changed", model: "claude", updatedAt: new Date().toISOString() }, 1)).toBe(sessionSignature(session, 1));
    expect(pagerImage("next", "1/2")).toContain(">1/2<");
    expect(emptyImage()).not.toMatch(/>INFO<|>WORKING</);
    expect(getPalette("unsupported").id).toBe(defaultPaletteId);
  });

  it("identifies every harness/host combination without using the model or title", () => {
    for (const identity of cardIdentities) {
      const entry = { ...session, source: identity.id, harness: identity.id, focusTarget: undefined, metadata: { host: identity.host === "ide" || identity.id === "intellij-ai" ? "IntelliJ IDEA" : identity.host === "app-window" ? "Desktop app" : "Terminal" } };
      expect(sessionType(entry)).toBe(identity.id);
      expect(sessionImage(entry)).not.toBe("");
    }
    expect(sessionType({ ...session, source: "other", harness: "unknown", model: "claude", label: "copilot", metadata: {} })).toBe("generic");
    expect(sessionType({ ...session, source: "claude", harness: "claude", metadata: {}, focusTarget: { appName: "Claude" } })).toBe("claude-app");
    expect(sessionType({ ...session, source: "claude-cli", harness: "claude-cli", metadata: { host: "Claude Code terminal" } })).toBe("claude-cli");
  });
});
