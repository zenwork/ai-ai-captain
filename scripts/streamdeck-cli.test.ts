import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const streamDeckCliScriptPath = fileURLToPath(new URL("./streamdeck-cli.mjs", import.meta.url));
const streamDeckPluginPath = fileURLToPath(new URL("../streamdeck/com.local.ai-ai-captain.sdPlugin", import.meta.url));
const temporaryDirectoryPaths: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const temporaryDirectoryPath = await mkdtemp(join(tmpdir(), "ai-ai-captain-streamdeck-cli-"));
  temporaryDirectoryPaths.push(temporaryDirectoryPath);
  return temporaryDirectoryPath;
}

async function writeExecutableFile(filePath: string, fileContents: string): Promise<void> {
  await writeFile(filePath, fileContents, "utf8");
  await chmod(filePath, 0o755);
}

function runStreamDeckCliHelper(pathDirectory: string, environment: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, [streamDeckCliScriptPath], {
    encoding: "utf8",
    env: { ...process.env, ...environment, PATH: pathDirectory },
  });
}

afterEach(async () => {
  await Promise.all(temporaryDirectoryPaths.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

describe.skipIf(process.platform === "win32")("Stream Deck CLI helper", () => {
  it("prints install instructions and stops when the CLI is missing", async () => {
    const pathDirectory = await createTemporaryDirectory();

    const result = runStreamDeckCliHelper(pathDirectory);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Stream Deck CLI not found.");
    expect(result.stderr).toContain("npm install -g @elgato/cli");
  });

  it("runs developer mode, links the plugin, and restarts it when the CLI is on PATH", async () => {
    const temporaryDirectoryPath = await createTemporaryDirectory();
    const pathDirectory = join(temporaryDirectoryPath, "path");
    const callsFilePath = join(temporaryDirectoryPath, "calls.txt");
    await mkdir(pathDirectory);
    await writeExecutableFile(
      join(pathDirectory, "streamdeck"),
      '#!/bin/sh\nprintf "%s\\n" "$*" >> "$STREAMDECK_CALLS_FILE"\n',
    );

    const result = runStreamDeckCliHelper(pathDirectory, { STREAMDECK_CALLS_FILE: callsFilePath });

    expect(result.status).toBe(0);
    expect(await readFile(callsFilePath, "utf8")).toBe(
      `dev\nlink ${streamDeckPluginPath}\nrestart com.local.ai-ai-captain\n`,
    );
  });

  it("restarts the plugin when the CLI reports that it is already linked", async () => {
    const temporaryDirectoryPath = await createTemporaryDirectory();
    const pathDirectory = join(temporaryDirectoryPath, "path");
    const callsFilePath = join(temporaryDirectoryPath, "calls.txt");
    await mkdir(pathDirectory);
    await writeExecutableFile(
      join(pathDirectory, "streamdeck"),
      '#!/bin/sh\nprintf "%s\\n" "$*" >> "$STREAMDECK_CALLS_FILE"\nif [ "$1" = "link" ]; then printf "Plugin already linked\\n" >&2; exit 1; fi\n',
    );

    const result = runStreamDeckCliHelper(pathDirectory, { STREAMDECK_CALLS_FILE: callsFilePath });

    expect(result.status).toBe(0);
    expect(await readFile(callsFilePath, "utf8")).toBe(
      `dev\nlink ${streamDeckPluginPath}\nrestart com.local.ai-ai-captain\n`,
    );
    expect(result.stderr).toContain("Plugin already linked");
  });

  it("finds the CLI in npm's global prefix when it is not on PATH", async () => {
    const temporaryDirectoryPath = await createTemporaryDirectory();
    const pathDirectory = join(temporaryDirectoryPath, "path");
    const globalPrefix = join(temporaryDirectoryPath, "global");
    const globalBinDirectory = join(globalPrefix, "bin");
    const callsFilePath = join(temporaryDirectoryPath, "calls.txt");
    await mkdir(pathDirectory);
    await mkdir(globalBinDirectory, { recursive: true });
    await writeExecutableFile(
      join(pathDirectory, "npm"),
      '#!/bin/sh\nprintf "%s\\n" "$STREAMDECK_GLOBAL_PREFIX"\n',
    );
    await writeExecutableFile(
      join(globalBinDirectory, "streamdeck"),
      '#!/bin/sh\nprintf "%s\\n" "$*" >> "$STREAMDECK_CALLS_FILE"\n',
    );

    const result = runStreamDeckCliHelper(pathDirectory, {
      STREAMDECK_CALLS_FILE: callsFilePath,
      STREAMDECK_GLOBAL_PREFIX: globalPrefix,
    });

    expect(result.status).toBe(0);
    expect(await readFile(callsFilePath, "utf8")).toBe(
      `dev\nlink ${streamDeckPluginPath}\nrestart com.local.ai-ai-captain\n`,
    );
  });
});
