import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const browserLauncherPath = fileURLToPath(new URL("./open-deck-browser.sh", import.meta.url));
const temporaryDirectoryPaths: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const temporaryDirectoryPath = await mkdtemp(join(tmpdir(), "ai-ai-captain-deck-browser-"));
  temporaryDirectoryPaths.push(temporaryDirectoryPath);
  return temporaryDirectoryPath;
}

async function writeExecutableFile(filePath: string, fileContents: string): Promise<void> {
  await writeFile(filePath, fileContents, "utf8");
  await chmod(filePath, 0o755);
}

function runBrowserLauncher(pathDirectory: string, environment: NodeJS.ProcessEnv = {}) {
  return spawnSync("/bin/sh", [browserLauncherPath, "http://127.0.0.1:43682/deck.html", "420,140"], {
    encoding: "utf8",
    env: { ...process.env, ...environment, PATH: pathDirectory },
  });
}

afterEach(async () => {
  await Promise.all(temporaryDirectoryPaths.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

describe("virtual deck browser launcher", () => {
  it("uses macOS open to launch a Chrome app window", async () => {
    const temporaryDirectoryPath = await createTemporaryDirectory();
    const pathDirectory = join(temporaryDirectoryPath, "path");
    const callsFilePath = join(temporaryDirectoryPath, "calls.txt");
    await mkdir(pathDirectory);
    await writeExecutableFile(join(pathDirectory, "uname"), '#!/bin/sh\nprintf "Darwin\\n"\n');
    await writeExecutableFile(
      join(pathDirectory, "open"),
      '#!/bin/sh\nprintf "%s\\n" "$@" > "$DECK_LAUNCH_CALLS_FILE"\n',
    );

    const result = runBrowserLauncher(pathDirectory, { DECK_LAUNCH_CALLS_FILE: callsFilePath });

    expect(result.status).toBe(0);
    expect(await readFile(callsFilePath, "utf8")).toBe(
      `-na\nGoogle Chrome\n--args\n--app=http://127.0.0.1:43682/deck.html\n--window-size=420,140\n`,
    );
  });

  it("uses an available Chrome-compatible browser on Linux", async () => {
    const temporaryDirectoryPath = await createTemporaryDirectory();
    const pathDirectory = join(temporaryDirectoryPath, "path");
    const callsFilePath = join(temporaryDirectoryPath, "calls.txt");
    await mkdir(pathDirectory);
    await writeExecutableFile(join(pathDirectory, "uname"), '#!/bin/sh\nprintf "Linux\\n"\n');
    await writeExecutableFile(
      join(pathDirectory, "chromium"),
      '#!/bin/sh\nprintf "%s\\n" "$@" > "$DECK_LAUNCH_CALLS_FILE"\n',
    );

    const result = runBrowserLauncher(pathDirectory, { DECK_LAUNCH_CALLS_FILE: callsFilePath });

    expect(result.status).toBe(0);
    expect(await readFile(callsFilePath, "utf8")).toBe(
      `--app=http://127.0.0.1:43682/deck.html\n--window-size=420,140\n`,
    );
  });

  it("reports when Linux has no supported browser", async () => {
    const temporaryDirectoryPath = await createTemporaryDirectory();
    const pathDirectory = join(temporaryDirectoryPath, "path");
    await mkdir(pathDirectory);
    await writeExecutableFile(join(pathDirectory, "uname"), '#!/bin/sh\nprintf "Linux\\n"\n');

    const result = runBrowserLauncher(pathDirectory);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Google Chrome or Chromium was not found on PATH.");
  });

  it("reports an unsupported operating system", async () => {
    const temporaryDirectoryPath = await createTemporaryDirectory();
    const pathDirectory = join(temporaryDirectoryPath, "path");
    await mkdir(pathDirectory);
    await writeExecutableFile(join(pathDirectory, "uname"), '#!/bin/sh\nprintf "FreeBSD\\n"\n');

    const result = runBrowserLauncher(pathDirectory);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Opening the deck is not supported on operating system 'FreeBSD'.");
  });
});
