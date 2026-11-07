import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { applyMarketplaceMetadata, createListingText, extractReleaseNotes, toStreamDeckVersion } from "./marketplace-metadata.mjs";
import { cliInstallHint, findStreamDeckCli, pluginDirectory, repositoryRoot as root, runStreamDeckCommand } from "./plugin-tools.mjs";

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

const streamDeckCliPath = findStreamDeckCli();
if (streamDeckCliPath === undefined) throw new Error(`Stream Deck CLI not found. ${cliInstallHint}`);
for (const commandArguments of [
  ["validate", pluginDirectory, "--no-update-check"],
  ["pack", pluginDirectory, "--output", outputDirectory, "--force", "--no-update-check"],
]) {
  const exitCode = runStreamDeckCommand(streamDeckCliPath, commandArguments);
  if (exitCode !== 0) process.exit(exitCode);
}
console.log(`The pack file and listing.md are in ${outputDirectory}`);
