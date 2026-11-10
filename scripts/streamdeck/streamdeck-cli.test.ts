import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const pluginToolsUrl = new URL("./plugin-tools.mjs", import.meta.url).href;
const streamDeckPluginPath = fileURLToPath(new URL("../../streamdeck/com.local.ai-ai-captain.sdPlugin", import.meta.url));
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

function runStreamDeckCliHelper(
  pathDirectory: string,
  environment: NodeJS.ProcessEnv = {},
  installedDirectory = join(pathDirectory, "installed"),
  sourceDirectory = streamDeckPluginPath,
) {
  return spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { reloadStreamDeckPlugin } from ${JSON.stringify(pluginToolsUrl)}; process.exitCode = reloadStreamDeckPlugin(JSON.parse(process.argv[1]));`,
      JSON.stringify({ installedDirectory, sourceDirectory }),
    ],
    {
      encoding: "utf8",
      env: { ...process.env, ...environment, PATH: pathDirectory },
    },
  );
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
    await writeExecutableFile(join(pathDirectory, "streamdeck"), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$STREAMDECK_CALLS_FILE"\n');

    const result = runStreamDeckCliHelper(pathDirectory, { STREAMDECK_CALLS_FILE: callsFilePath });

    expect(result.status).toBe(0);
    expect(await readFile(callsFilePath, "utf8")).toBe(`dev\nlink ${streamDeckPluginPath}\nrestart com.local.ai-ai-captain\n`);
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
    expect(await readFile(callsFilePath, "utf8")).toBe(`dev\nlink ${streamDeckPluginPath}\nrestart com.local.ai-ai-captain\n`);
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
    await writeExecutableFile(join(pathDirectory, "npm"), '#!/bin/sh\nprintf "%s\\n" "$STREAMDECK_GLOBAL_PREFIX"\n');
    await writeExecutableFile(join(globalBinDirectory, "streamdeck"), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$STREAMDECK_CALLS_FILE"\n');

    const result = runStreamDeckCliHelper(pathDirectory, {
      STREAMDECK_CALLS_FILE: callsFilePath,
      STREAMDECK_GLOBAL_PREFIX: globalPrefix,
    });

    expect(result.status).toBe(0);
    expect(await readFile(callsFilePath, "utf8")).toBe(`dev\nlink ${streamDeckPluginPath}\nrestart com.local.ai-ai-captain\n`);
  });
});

describe.skipIf(process.platform === "win32")("installed Stream Deck reload", () => {
  it("updates installed files and preserves profiles and logs", async () => {
    const root = await createTemporaryDirectory();
    const source = join(root, "source");
    const installed = join(root, "installed");
    const calls = join(root, "calls.txt");
    await mkdir(source);
    await mkdir(installed);
    await writeExecutableFile(join(root, "streamdeck"), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$STREAMDECK_CALLS_FILE"\n');
    for (const directory of [source, installed]) {
      await writeFile(join(directory, "manifest.json"), JSON.stringify({ UUID: "com.local.ai-ai-captain" }));
    }
    for (const name of ["bin", "imgs", "web"]) {
      await mkdir(join(source, name));
      await writeFile(join(source, name, "updated.txt"), "new runtime");
    }
    await writeFile(join(source, "THIRD_PARTY_NOTICES.txt"), "notices");
    await mkdir(join(installed, "profiles"));
    await mkdir(join(installed, "logs"));
    await writeFile(join(installed, "profiles", "custom.txt"), "custom layout");
    await writeFile(join(installed, "logs", "current.txt"), "existing log");
    const result = runStreamDeckCliHelper(root, { STREAMDECK_CALLS_FILE: calls }, installed, source);
    expect(result.status).toBe(0);
    expect(await readFile(calls, "utf8")).toBe("dev\nstop com.local.ai-ai-captain\nrestart com.local.ai-ai-captain\n");
    expect(await readFile(join(installed, "bin", "updated.txt"), "utf8")).toBe("new runtime");
    expect(await readFile(join(installed, "profiles", "custom.txt"), "utf8")).toBe("custom layout");
    expect(await readFile(join(installed, "logs", "current.txt"), "utf8")).toBe("existing log");
  });

  it("restarts a development link without linking or copying again", async () => {
    const root = await createTemporaryDirectory();
    const installed = join(root, "installed");
    const calls = join(root, "calls.txt");
    const source = join(root, "source");
    await mkdir(source);
    await symlink(source, installed);
    await writeExecutableFile(join(root, "streamdeck"), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$STREAMDECK_CALLS_FILE"\n');
    const result = runStreamDeckCliHelper(root, { STREAMDECK_CALLS_FILE: calls }, installed, source);
    expect(result.status).toBe(0);
    expect(await readFile(calls, "utf8")).toBe("dev\nrestart com.local.ai-ai-captain\n");
  });

  it("rejects an installed folder with a different UUID before stopping the plugin", async () => {
    const root = await createTemporaryDirectory();
    const installed = join(root, "installed");
    const calls = join(root, "calls.txt");
    const source = join(root, "source");
    await mkdir(source);
    await mkdir(installed);
    await writeFile(join(source, "manifest.json"), JSON.stringify({ UUID: "com.local.ai-ai-captain" }));
    await writeFile(join(installed, "manifest.json"), JSON.stringify({ UUID: "another.plugin" }));
    await writeExecutableFile(join(root, "streamdeck"), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$STREAMDECK_CALLS_FILE"\n');
    const result = runStreamDeckCliHelper(root, { STREAMDECK_CALLS_FILE: calls }, installed, source);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("PLUGIN_MANIFEST_INVALID");
    expect(await readFile(calls, "utf8")).toBe("dev\n");
  });
});
