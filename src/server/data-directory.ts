import { access, rename } from "node:fs/promises";
import { join } from "node:path";

const dataDirectoryName = "ai-ai-captain";
// The project had this name before. Keep it to move the data of earlier installations.
const legacyDataDirectoryName = "ai-deck";

export interface DataDirectoryOptions {
  configuredDirectory: string | undefined;
  homeDirectory: string;
  log?: (message: string) => void;
}

/**
 * Returns the data directory of the hub.
 *
 * If the user did not configure a directory, the hub uses the default directory. When only the directory of an
 * earlier installation exists, this function moves it to the default directory. Thus the palette and the
 * host-lifetime records stay after the change of the project name.
 */
export async function resolveDataDirectory(options: DataDirectoryOptions): Promise<string> {
  if (options.configuredDirectory !== undefined) return options.configuredDirectory;

  const applicationSupportDirectory = join(options.homeDirectory, "Library", "Application Support");
  const dataDirectory = join(applicationSupportDirectory, dataDirectoryName);
  const legacyDataDirectory = join(applicationSupportDirectory, legacyDataDirectoryName);

  if (await pathExists(dataDirectory)) return dataDirectory;
  if (!(await pathExists(legacyDataDirectory))) return dataDirectory;

  await rename(legacyDataDirectory, dataDirectory);
  options.log?.(`Moved the hub data from ${legacyDataDirectory} to ${dataDirectory}.`);
  return dataDirectory;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
