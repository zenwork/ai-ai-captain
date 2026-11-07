// Links the built plugin to the Stream Deck app in developer mode and restarts it. Run it with `npm run reload:streamdeck`.
import { cliInstallHint, findStreamDeckCli, pluginDirectory, pluginIdentifier, runStreamDeckCommand } from "./plugin-tools.mjs";

const streamDeckCliPath = findStreamDeckCli();

if (streamDeckCliPath === undefined) {
  console.error(`Stream Deck CLI not found. ${cliInstallHint} Then run \`npm run reload:streamdeck\` again.`);
  process.exitCode = 1;
} else {
  const streamDeckCommands = [
    { arguments: ["dev"] },
    { arguments: ["link", pluginDirectory], allowAlreadyLinked: true },
    { arguments: ["restart", pluginIdentifier] },
  ];

  for (const streamDeckCommand of streamDeckCommands) {
    const exitCode = runStreamDeckCommand(streamDeckCliPath, streamDeckCommand.arguments, streamDeckCommand.allowAlreadyLinked);
    if (exitCode !== 0) {
      process.exitCode = exitCode;
      break;
    }
  }
}
