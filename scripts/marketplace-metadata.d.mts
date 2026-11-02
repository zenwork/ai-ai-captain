// Types for marketplace-metadata.mjs.

/** The fields of streamdeck/marketplace.json that the listing uses. */
export interface MarketplaceSettings {
  author: string;
  description: string;
  tags: string[];
}

export const maximumDescriptionLength: number;

export function toStreamDeckVersion(packageVersion: string): string;

export function extractReleaseNotes(changelogText: string, packageVersion: string): string;

export function applyMarketplaceMetadata<Manifest extends object>(
  manifest: Manifest,
  settings: MarketplaceSettings,
  packageVersion: string,
): Manifest & { Author: string; Description: string; Version: string };

export function createListingText(settings: MarketplaceSettings, version: string, releaseNotes: string): string;
