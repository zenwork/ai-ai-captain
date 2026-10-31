import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyMarketplaceMetadata, createListingText, extractReleaseNotes, toStreamDeckVersion } from "./marketplace-metadata.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const pluginDirectory = join(root, "streamdeck", "com.local.ai-ai-captain.sdPlugin");
const outputDirectory = join(root, "dist", "marketplace");

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

const packageInformation = await readJson(join(root, "package.json"));
const settings = await readJson(join(root, "streamdeck", "marketplace.json"));
const manifestPath = join(pluginDirectory, "manifest.json");
const manifest = await readJson(manifestPath);
const updatedManifest = applyMarketplaceMetadata(manifest, settings, packageInformation.version);
await writeFile(manifestPath, `${JSON.stringify(updatedManifest, null, 2)}\n`);

const changelog = await readFile(join(root, "CHANGELOG.md"), "utf8");
const releaseNotes = extractReleaseNotes(changelog, packageInformation.version);
await mkdir(outputDirectory, { recursive: true });
await writeFile(join(outputDirectory, "listing.md"), createListingText(settings, toStreamDeckVersion(packageInformation.version), releaseNotes));

execFileSync("streamdeck", ["validate", pluginDirectory, "--no-update-check"], { stdio: "inherit" });
execFileSync("streamdeck", ["pack", pluginDirectory, "--output", outputDirectory, "--force", "--no-update-check"], { stdio: "inherit" });
console.log(`The pack file and listing.md are in ${outputDirectory}`);
