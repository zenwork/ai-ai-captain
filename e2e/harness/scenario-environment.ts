import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startHub, type HubHandle } from "./hub-process.js";

export interface ScenarioEnvironmentOptions {
  /** The port of the hub. A free port is the default. */
  port?: number;
  discoveryIntervalMilliseconds?: number;
}

/** One hub with its temporary folders. Scenarios use an environment to start agents and to read the hub. */
export interface ScenarioEnvironment {
  hub: HubHandle;
  temporaryDirectory: string;
  /** The folder with the links to the Node.js program, one for each agent name. */
  binDirectory: string;
  /** The folder that `{PROJECT_1}` gives. */
  projectDirectory: string;
  /** Stops the hub. The temporary files stay when `keepFiles` is true, so that a person can read them. */
  stop(options?: { keepFiles?: boolean }): Promise<void>;
}

export async function startScenarioEnvironment(options: ScenarioEnvironmentOptions = {}): Promise<ScenarioEnvironment> {
  // The real path is necessary on macOS, where /var is a link. Process paths show the real path.
  const temporaryDirectory = await realpath(await mkdtemp(join(tmpdir(), "ai-ai-captain-e2e-")));
  const binDirectory = join(temporaryDirectory, "bin");
  const projectDirectory = join(temporaryDirectory, "projects", "project-1");
  await mkdir(projectDirectory, { recursive: true });
  const hub = await startHub({
    temporaryDirectory,
    ...(options.port === undefined ? {} : { port: options.port }),
    ...(options.discoveryIntervalMilliseconds === undefined ? {} : { discoveryIntervalMilliseconds: options.discoveryIntervalMilliseconds }),
  }).catch(async (error: unknown) => {
    await rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  });
  return {
    hub,
    temporaryDirectory,
    binDirectory,
    projectDirectory,
    stop: async (stopOptions = {}) => {
      await hub.stop();
      if (!stopOptions.keepFiles) await rm(temporaryDirectory, { recursive: true, force: true });
    },
  };
}
