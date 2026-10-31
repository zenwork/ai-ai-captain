import { describe, expect, it } from "vitest";
import { applyMarketplaceMetadata, extractReleaseNotes, maximumDescriptionLength, toStreamDeckVersion } from "./marketplace-metadata.mjs";

const changelog = `# Changelog

## [0.3.0](https://example.com/compare) (2026-10-30)


### Features

* **appearance:** add flash ([4381bca](https://example.com/commit/4381bca))

## [0.2.1](https://example.com/compare) (2026-10-27)

### Bug Fixes

* old fix
`;

describe("marketplace metadata", () => {
  it("makes a four-number version", () => {
    expect(toStreamDeckVersion("0.3.0")).toBe("0.3.0.0");
    expect(() => toStreamDeckVersion("next")).toThrow();
  });

  it("extracts the notes of one version without commit links", () => {
    const notes = extractReleaseNotes(changelog, "0.3.0");
    expect(notes).toContain("appearance: add flash");
    expect(notes).not.toContain("4381bca");
    expect(notes).not.toContain("old fix");
    expect(extractReleaseNotes(changelog, "9.9.9")).toBe("");
  });

  it("keeps the UUID and sets author, description, and version", () => {
    const result = applyMarketplaceMetadata({ UUID: "a.b", Version: "0.1.0.0" }, { author: "Me", description: "Text", tags: [] }, "0.3.0");
    expect(result).toMatchObject({ UUID: "a.b", Author: "Me", Description: "Text", Version: "0.3.0.0" });
  });

  it("rejects a description that is too long", () => {
    const description = "x".repeat(maximumDescriptionLength + 1);
    expect(() => applyMarketplaceMetadata({}, { author: "Me", description, tags: [] }, "0.3.0")).toThrow();
  });
});
