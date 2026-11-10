// Shared values and helpers for the Stream Deck scripts: the plugin location and the Stream Deck CLI.
import { accessSync, constants, cpSync, existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { z } from "zod";

export const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
export const pluginIdentifier = "com.local.ai-ai-captain";
export const pluginDirectory = join(repositoryRoot, "streamdeck", `${pluginIdentifier}.sdPlugin`);
export const cliInstallHint = "Install the Stream Deck CLI with `npm install -g @elgato/cli`.";

function isExecutableFile(filePath) {
  try {
    if (!statSync(filePath).isFile()) return false;
    accessSync(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Finds the Stream Deck CLI on the PATH or in the global npm prefix. Returns undefined when it is not installed. */
export function findStreamDeckCli() {
  for (const pathDirectory of (process.env.PATH ?? "").split(delimiter)) {
    if (pathDirectory.length === 0) continue;
    const candidatePath = join(pathDirectory, "streamdeck");
    if (isExecutableFile(candidatePath)) return candidatePath;
  }

  const npmGlobalPrefixResult = spawnSync("npm", ["prefix", "-g"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  if (npmGlobalPrefixResult.error || npmGlobalPrefixResult.status !== 0) return undefined;
  const npmGlobalPrefix = npmGlobalPrefixResult.stdout.trim();
  if (npmGlobalPrefix.length === 0) return undefined;
  const globalCliPath = join(npmGlobalPrefix, "bin", "streamdeck");
  return isExecutableFile(globalCliPath) ? globalCliPath : undefined;
}

/**
 * Runs one Stream Deck CLI command and shows its output. Returns the exit code.
 * With allowAlreadyLinked, the "already linked" failure of the link command counts as success.
 */
export function runStreamDeckCommand(streamDeckCliPath, commandArguments, allowAlreadyLinked = false) {
  const result = spawnSync(streamDeckCliPath, commandArguments, { encoding: "utf8" });
  const standardOutput = result.stdout ?? "";
  const standardError = result.stderr ?? "";
  if (standardOutput.length > 0) process.stdout.write(standardOutput);
  if (standardError.length > 0) process.stderr.write(standardError);

  if (result.error) {
    console.error(`Could not start the Stream Deck CLI: ${result.error.message}`);
    return 1;
  }
  const commandOutput = `${standardOutput}\n${standardError}`;
  if (allowAlreadyLinked && result.status !== 0 && /already linked/i.test(commandOutput)) return 0;
  return result.status ?? 1;
}

/** Find the standard plugin directory without changing Stream Deck settings. */
export function installedPluginDirectory(platform = process.platform, userDirectory = homedir(), applicationDataDirectory = process.env.APPDATA) {
  if (platform === "darwin") return join(userDirectory, "Library", "Application Support", "com.elgato.StreamDeck", "Plugins", `${pluginIdentifier}.sdPlugin`);
  if (platform === "win32" && applicationDataDirectory)
    return join(applicationDataDirectory, "Elgato", "StreamDeck", "Plugins", `${pluginIdentifier}.sdPlugin`);
  return undefined;
}

/** Update installed runtime files without replacing profiles, logs, or key assignments. */
export function reloadStreamDeckPlugin(options = {}) {
  const sourceDirectory = options.sourceDirectory ?? pluginDirectory;
  const installedDirectory = options.installedDirectory ?? installedPluginDirectory();
  const streamDeckCliPath = findStreamDeckCli();
  if (!streamDeckCliPath) {
    console.error(`Stream Deck CLI not found. ${cliInstallHint} Then run \`npm run reload:streamdeck\` again.`);
    return 1;
  }
  const developerModeResult = runStreamDeckCommand(streamDeckCliPath, ["dev"]);
  if (developerModeResult !== 0) return developerModeResult;
  if (installedDirectory && existsSync(installedDirectory)) {
    if (realpathSync(installedDirectory) === realpathSync(sourceDirectory)) {
      return runStreamDeckCommand(streamDeckCliPath, ["restart", pluginIdentifier]);
    }
    const manifestSchema = z.object({ UUID: z.literal(pluginIdentifier) });
    try {
      for (const directory of [sourceDirectory, installedDirectory]) {
        manifestSchema.parse(JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8")));
      }
    } catch {
      console.error("PLUGIN_MANIFEST_INVALID");
      return 1;
    }
    const stopResult = runStreamDeckCommand(streamDeckCliPath, ["stop", pluginIdentifier]);
    if (stopResult !== 0) return stopResult;
    let updateResult = 0;
    try {
      for (const entry of ["bin", "imgs", "web", "manifest.json", "THIRD_PARTY_NOTICES.txt"]) {
        cpSync(join(sourceDirectory, entry), join(installedDirectory, entry), { recursive: true });
      }
      console.info("Updated the installed plugin. Profiles and key assignments stay unchanged.");
    } catch {
      console.error("PLUGIN_UPDATE_FAILED");
      updateResult = 1;
    }
    const restartResult = runStreamDeckCommand(streamDeckCliPath, ["restart", pluginIdentifier]);
    return updateResult || restartResult;
  }
  const linkResult = runStreamDeckCommand(streamDeckCliPath, ["link", sourceDirectory], true);
  if (linkResult !== 0) return linkResult;
  return runStreamDeckCommand(streamDeckCliPath, ["restart", pluginIdentifier]);
}
