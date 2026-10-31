export const maximumDescriptionLength = 1500;

/** Stream Deck versions have four numbers. Use the package version and add a build number of zero. */
export function toStreamDeckVersion(packageVersion) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(packageVersion);
  if (match === null) throw new Error(`Invalid package version: ${packageVersion}`);
  return `${match[1]}.${match[2]}.${match[3]}.0`;
}

/** Returns the release notes of one version from the Release Please changelog. */
export function extractReleaseNotes(changelogText, packageVersion) {
  const lines = changelogText.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`## [${packageVersion}]`));
  if (start === -1) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## ["));
  const section = end === -1 ? rest : rest.slice(0, end);
  return section
    .map((line) => line.replace(/\s*\(\[[0-9a-f]+\]\([^)]*\)\)/g, "").replace(/\*\*([^*]+)\*\*/g, "$1"))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Returns a copy of the manifest with the marketplace metadata. The UUIDs stay the same. */
export function applyMarketplaceMetadata(manifest, settings, packageVersion) {
  if (settings.description.length > maximumDescriptionLength) {
    throw new Error(`The description has ${settings.description.length} characters. The limit is ${maximumDescriptionLength}.`);
  }
  return {
    ...manifest,
    Author: settings.author,
    Description: settings.description,
    Version: toStreamDeckVersion(packageVersion),
  };
}

export function createListingText(settings, version, releaseNotes) {
  const notes = releaseNotes.length > 0 ? releaseNotes : "No release notes.";
  return `# AI AI Captain ${version}\n\n## Description\n\n${settings.description}\n\n## Tags\n\n${settings.tags.join(", ")}\n\n## Release notes\n\n${notes}\n`;
}
