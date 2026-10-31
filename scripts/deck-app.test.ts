import { execFile } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const executeFile = promisify(execFile);
const startupScriptPath = fileURLToPath(new URL("./deck-app.sh", import.meta.url));
const projectDirectoryPath = fileURLToPath(new URL("../", import.meta.url));
const temporaryDirectoryPaths: string[] = [];
const servers: Server[] = [];

async function listen(server: Server): Promise<number> {
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("The test server has no TCP address.");
  }
  return address.port;
}

async function createLauncherEnvironment(): Promise<{ directoryPath: string; callsFilePath: string }> {
  const directoryPath = await mkdtemp(join(tmpdir(), "ai-ai-captain-deck-startup-"));
  temporaryDirectoryPaths.push(directoryPath);
  const commands = {
    npm: "#!/bin/sh\nexit 0\n",
    npx: "#!/bin/sh\nexit 0\n",
    uname: '#!/bin/sh\nprintf "Darwin\\n"\n',
    open: '#!/bin/sh\nprintf "%s\\n" "$@" > "$DECK_LAUNCH_CALLS_FILE"\n',
  };
  await Promise.all(Object.entries(commands).map(async ([name, contents]) => {
    const commandPath = join(directoryPath, name);
    await writeFile(commandPath, contents, "utf8");
    await chmod(commandPath, 0o755);
  }));
  return { directoryPath, callsFilePath: join(directoryPath, "calls.txt") };
}

async function runLauncher(
  directoryPath: string,
  callsFilePath: string,
  port: number,
  environment: NodeJS.ProcessEnv = {},
): Promise<string> {
  const result = await executeFile("/bin/sh", [startupScriptPath], {
    cwd: projectDirectoryPath,
    timeout: 4_000,
    killSignal: "SIGKILL",
    env: {
      ...process.env,
      ...environment,
      PATH: `${directoryPath}:${process.env.PATH ?? "/usr/bin:/bin"}`,
      AI_AI_CAPTAIN_DECK_PORT: String(port),
      AI_AI_CAPTAIN_DECK_WINDOW_SIZE: "420,140",
      DECK_LAUNCH_CALLS_FILE: callsFilePath,
    },
  });
  return result.stdout;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(async (server) => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }));
  await Promise.all(temporaryDirectoryPaths.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

describe.skipIf(process.platform === "win32")("virtual deck startup", () => {
  it("opens Chrome after a direct readiness check despite proxy settings and curl configuration", async () => {
    const { directoryPath, callsFilePath } = await createLauncherEnvironment();
    let proxyRequestCount = 0;
    const proxyPort = await listen(createServer((_request, response) => {
      proxyRequestCount += 1;
      response.writeHead(503).end();
    }));
    const requestedPaths: (string | undefined)[] = [];
    const port = await listen(createServer((request, response) => {
      requestedPaths.push(request.url);
      response.end("ready");
    }));
    const proxyAddress = `http://127.0.0.1:${proxyPort}`;
    await writeFile(join(directoryPath, ".curlrc"), `proxy = "${proxyAddress}"\n`, "utf8");

    const output = await runLauncher(directoryPath, callsFilePath, port, {
      CURL_HOME: directoryPath,
      http_proxy: proxyAddress,
      HTTP_PROXY: proxyAddress,
      all_proxy: proxyAddress,
      ALL_PROXY: proxyAddress,
      no_proxy: "",
      NO_PROXY: "",
    });

    expect(proxyRequestCount).toBe(0);
    expect(requestedPaths).toEqual(["/deck.html"]);
    expect(await readFile(callsFilePath, "utf8")).toContain(`--app=http://127.0.0.1:${port}/deck.html\n`);
    expect(output).toContain("Press Ctrl+C to stop it.");
  });

  it("retries a stalled readiness request instead of waiting without a time limit", async () => {
    const { directoryPath, callsFilePath } = await createLauncherEnvironment();
    let requestCount = 0;
    const port = await listen(createServer((_request, response) => {
      requestCount += 1;
      if (requestCount === 1) return;
      response.end("ready");
    }));

    await runLauncher(directoryPath, callsFilePath, port);

    expect(requestCount).toBe(2);
    expect(await readFile(callsFilePath, "utf8")).toContain(`--app=http://127.0.0.1:${port}/deck.html\n`);
  });
});
