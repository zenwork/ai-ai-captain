import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveDataDirectory } from "./data-directory.js";

describe("resolveDataDirectory", () => {
  let homeDirectory: string;
  let applicationSupportDirectory: string;

  beforeEach(async () => {
    homeDirectory = await mkdtemp(join(tmpdir(), "ai-ai-captain-home-"));
    applicationSupportDirectory = join(homeDirectory, "Library", "Application Support");
    await mkdir(applicationSupportDirectory, { recursive: true });
  });

  afterEach(async () => {
    await rm(homeDirectory, { recursive: true, force: true });
  });

  it("uses the configured directory without changes", async () => {
    await mkdir(join(applicationSupportDirectory, "ai-deck"));

    const dataDirectory = await resolveDataDirectory({ configuredDirectory: "/custom/data", homeDirectory });

    expect(dataDirectory).toBe("/custom/data");
    expect(existsSync(join(applicationSupportDirectory, "ai-deck"))).toBe(true);
  });

  it("returns the default directory when no data exists", async () => {
    const dataDirectory = await resolveDataDirectory({ configuredDirectory: undefined, homeDirectory });

    expect(dataDirectory).toBe(join(applicationSupportDirectory, "ai-ai-captain"));
  });

  it("moves the data of an earlier installation to the default directory", async () => {
    const legacyDirectory = join(applicationSupportDirectory, "ai-deck");
    await mkdir(legacyDirectory);
    await writeFile(join(legacyDirectory, "settings.json"), '{"palette":"signal"}');
    const messages: string[] = [];

    const dataDirectory = await resolveDataDirectory({ configuredDirectory: undefined, homeDirectory, log: (message) => messages.push(message) });

    expect(dataDirectory).toBe(join(applicationSupportDirectory, "ai-ai-captain"));
    expect(await readFile(join(dataDirectory, "settings.json"), "utf8")).toBe('{"palette":"signal"}');
    expect(existsSync(legacyDirectory)).toBe(false);
    expect(messages).toHaveLength(1);
  });

  it("does not replace existing data with the data of an earlier installation", async () => {
    const legacyDirectory = join(applicationSupportDirectory, "ai-deck");
    const currentDirectory = join(applicationSupportDirectory, "ai-ai-captain");
    await mkdir(legacyDirectory);
    await mkdir(currentDirectory);

    const dataDirectory = await resolveDataDirectory({ configuredDirectory: undefined, homeDirectory });

    expect(dataDirectory).toBe(currentDirectory);
    expect(existsSync(legacyDirectory)).toBe(true);
  });
});
