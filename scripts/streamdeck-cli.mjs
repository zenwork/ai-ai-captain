import { accessSync, constants, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";

const streamDeckPluginIdentifier = "com.local.ai-ai-captain";
const streamDeckPluginPath = fileURLToPath(new URL("../streamdeck/com.local.ai-ai-captain.sdPlugin", import.meta.url));

function isExecutableFile(filePath) {
  try {
    if (!statSync(filePath).isFile()) return false;
    accessSync(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function findStreamDeckCli() {
  const pathDirectories = (process.env.PATH ?? "").split(delimiter);

  for (const pathDirectory of pathDirectories) {
    if (pathDirectory.length === 0) continue;

    const candidatePath = join(pathDirectory, "streamdeck");
    if (isExecutableFile(candidatePath)) return candidatePath;
  }

  const npmGlobalPrefixResult = spawnSync("npm", ["prefix", "-g"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

  if (npmGlobalPrefixResult.error || npmGlobalPrefixResult.status !== 0) return undefined;

  const npmGlobalPrefix = npmGlobalPrefixResult.stdout.trim();
  if (npmGlobalPrefix.length === 0) return undefined;

  const globalCliPath = join(npmGlobalPrefix, "bin", "streamdeck");
  return isExecutableFile(globalCliPath) ? globalCliPath : undefined;
}

function runStreamDeckCommand(streamDeckCliPath, commandArguments, allowAlreadyLinked = false) {
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

const streamDeckCliPath = findStreamDeckCli();

if (streamDeckCliPath === undefined) {
  console.error(
    "Stream Deck CLI not found. Install it with `npm install -g @elgato/cli`, then run `npm run reload:streamdeck` again.",
  );
  process.exitCode = 1;
} else {
  const streamDeckCommands = [
    { arguments: ["dev"] },
    { arguments: ["link", streamDeckPluginPath], allowAlreadyLinked: true },
    { arguments: ["restart", streamDeckPluginIdentifier] },
  ];

  for (const streamDeckCommand of streamDeckCommands) {
    const exitCode = runStreamDeckCommand(
      streamDeckCliPath,
      streamDeckCommand.arguments,
      streamDeckCommand.allowAlreadyLinked,
    );
    if (exitCode !== 0) {
      process.exitCode = exitCode;
      break;
    }
  }
}
