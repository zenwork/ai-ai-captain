import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const healthCheckTimeoutMilliseconds = 1_500;
const externalHubCheckIntervalMilliseconds = 5_000;
// `npm run dev` restarts the hub after each source change. A second check prevents a start during that short restart.
const externalHubConfirmationDelayMilliseconds = 3_000;
const initialRestartDelayMilliseconds = 1_000;
const maximumRestartDelayMilliseconds = 30_000;
// A hub that runs for this time is stable. Its next failure starts again with the initial restart delay.
const stableRunMilliseconds = 60_000;
const supervisedHubLogLevel = "warn";

export type HubSupervisorMode = "idle" | "external" | "supervised" | "restarting" | "stopped";

export interface HubLog {
  info(message: string): void;
  warn(message: string): void;
}

export interface HubProcess {
  /** Resolves with the exit code when the process stops. */
  readonly exited: Promise<number | null>;
  stop(): void;
}

export interface HubSupervisorOptions {
  hubUrl: string;
  isHubHealthy: () => Promise<boolean>;
  startHubProcess: () => HubProcess;
  log: HubLog;
  now?: () => number;
}

/**
 * Keeps one AI AI Captain hub available while the Stream Deck plugin runs.
 *
 * If a hub already answers at the hub URL, the supervisor uses that hub and does not start a second one.
 * This lets a developer run `npm run dev`. If no hub answers, the supervisor starts a hub process.
 * When that process stops, the supervisor starts it again after a delay that increases after each failure.
 */
export class HubSupervisor {
  private currentMode: HubSupervisorMode = "idle";
  private hubProcess: HubProcess | undefined;
  private hubProcessStartedAt = 0;
  private restartDelayMilliseconds = initialRestartDelayMilliseconds;
  private externalHubFailureSeen = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly now: () => number;

  constructor(private readonly options: HubSupervisorOptions) {
    this.now = options.now ?? Date.now;
  }

  get mode(): HubSupervisorMode {
    return this.currentMode;
  }

  start(): void {
    if (this.currentMode !== "idle") return;
    void this.ensureHub();
  }

  stop(): void {
    this.currentMode = "stopped";
    clearTimeout(this.timer);
    this.timer = undefined;
    this.hubProcess?.stop();
    this.hubProcess = undefined;
  }

  private async ensureHub(): Promise<void> {
    const hubIsHealthy = await this.options.isHubHealthy();
    if (this.currentMode === "stopped") return;

    if (hubIsHealthy) {
      this.useExternalHub();
      return;
    }

    if (this.currentMode === "external" && !this.externalHubFailureSeen) {
      this.externalHubFailureSeen = true;
      this.schedule(externalHubConfirmationDelayMilliseconds);
      return;
    }

    this.startSupervisedHub();
  }

  private useExternalHub(): void {
    if (this.currentMode !== "external") {
      this.options.log.info(`AI AI Captain plugin uses the hub that runs at ${this.options.hubUrl}.`);
    }
    this.currentMode = "external";
    this.externalHubFailureSeen = false;
    // The external hub can stop at any time. Then the plugin must start its own hub.
    this.schedule(externalHubCheckIntervalMilliseconds);
  }

  private startSupervisedHub(): void {
    this.options.log.info(`AI AI Captain plugin starts the hub at ${this.options.hubUrl}.`);
    const hubProcess = this.options.startHubProcess();
    this.hubProcess = hubProcess;
    this.hubProcessStartedAt = this.now();
    this.currentMode = "supervised";
    this.externalHubFailureSeen = false;

    void hubProcess.exited.then((exitCode) => {
      this.handleHubExit(hubProcess, exitCode);
    });
  }

  private handleHubExit(hubProcess: HubProcess, exitCode: number | null): void {
    if (this.hubProcess !== hubProcess) return;
    this.hubProcess = undefined;
    if (this.currentMode === "stopped") return;

    const runTimeMilliseconds = this.now() - this.hubProcessStartedAt;
    if (runTimeMilliseconds >= stableRunMilliseconds) {
      this.restartDelayMilliseconds = initialRestartDelayMilliseconds;
    }

    const delayMilliseconds = this.restartDelayMilliseconds;
    this.restartDelayMilliseconds = Math.min(delayMilliseconds * 2, maximumRestartDelayMilliseconds);
    this.currentMode = "restarting";
    this.options.log.warn(`AI AI Captain hub stopped with exit code ${String(exitCode)}. The plugin tries again in ${String(delayMilliseconds / 1_000)} s.`);
    this.schedule(delayMilliseconds);
  }

  private schedule(delayMilliseconds: number): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.ensureHub();
    }, delayMilliseconds);
  }
}

export async function isHubHealthy(hubUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${hubUrl}/health`, { signal: AbortSignal.timeout(healthCheckTimeoutMilliseconds) });
    return response.ok;
  } catch {
    return false;
  }
}

/** Returns the port of a hub URL on this computer, or `undefined` if the plugin must not start a hub for this URL. */
export function localHubPort(hubUrl: string): string | undefined {
  const url = new URL(hubUrl);
  const localHostNames = ["127.0.0.1", "localhost"];
  if (url.protocol !== "http:" || !localHostNames.includes(url.hostname)) return undefined;
  return url.port === "" ? "80" : url.port;
}

export interface HubProcessLaunch {
  nodeExecutablePath: string;
  hubEntryPath: string;
  webRootPath: string;
  port: string;
  log: HubLog;
}

export function spawnHubProcess(launch: HubProcessLaunch): HubProcess {
  const child = spawn(launch.nodeExecutablePath, [launch.hubEntryPath], {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      AI_AI_CAPTAIN_PORT: launch.port,
      AI_AI_CAPTAIN_WEB_DIR: launch.webRootPath,
      AI_AI_CAPTAIN_LOG_LEVEL: supervisedHubLogLevel,
      AI_AI_CAPTAIN_EXIT_WITH_PARENT: "1",
    },
  });

  // The hub writes only start messages, warnings, and errors in this mode. Send them to the Stream Deck plugin log.
  createInterface({ input: child.stdout }).on("line", (line) => {
    launch.log.info(`AI AI Captain hub: ${line}`);
  });
  createInterface({ input: child.stderr }).on("line", (line) => {
    launch.log.warn(`AI AI Captain hub: ${line}`);
  });

  const exited = new Promise<number | null>((resolve) => {
    child.once("error", () => {
      resolve(null);
    });
    child.once("exit", (exitCode) => {
      resolve(exitCode);
    });
  });

  return {
    exited,
    stop: () => {
      child.kill("SIGTERM");
    },
  };
}
