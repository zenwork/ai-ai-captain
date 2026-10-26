import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HubSupervisor, localHubPort, type HubProcess } from "./hub-supervisor.js";

const hubUrl = "http://127.0.0.1:43681";

interface FakeHubProcess extends HubProcess {
  exit(exitCode: number | null): void;
  stop: ReturnType<typeof vi.fn>;
}

function fakeHubProcess(): FakeHubProcess {
  let resolveExit: (exitCode: number | null) => void = () => undefined;
  const exited = new Promise<number | null>((resolve) => {
    resolveExit = resolve;
  });
  return {
    exited,
    exit: (exitCode) => {
      resolveExit(exitCode);
    },
    stop: vi.fn(),
  };
}

interface TestHarness {
  supervisor: HubSupervisor;
  startedProcesses: FakeHubProcess[];
  setHubHealthy(healthy: boolean): void;
  advanceClock(milliseconds: number): Promise<void>;
}

function createHarness(initiallyHealthy: boolean): TestHarness {
  let hubIsHealthy = initiallyHealthy;
  let clock = 0;
  const startedProcesses: FakeHubProcess[] = [];
  const supervisor = new HubSupervisor({
    hubUrl,
    log: { info: vi.fn(), warn: vi.fn() },
    isHubHealthy: () => Promise.resolve(hubIsHealthy),
    startHubProcess: () => {
      const hubProcess = fakeHubProcess();
      startedProcesses.push(hubProcess);
      return hubProcess;
    },
    now: () => clock,
  });

  return {
    supervisor,
    startedProcesses,
    setHubHealthy: (healthy) => {
      hubIsHealthy = healthy;
    },
    advanceClock: async (milliseconds) => {
      clock += milliseconds;
      await vi.advanceTimersByTimeAsync(milliseconds);
    },
  };
}

describe("HubSupervisor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts a hub process when no hub answers", async () => {
    const harness = createHarness(false);

    harness.supervisor.start();
    await harness.advanceClock(0);

    expect(harness.startedProcesses).toHaveLength(1);
    expect(harness.supervisor.mode).toBe("supervised");
  });

  it("uses a hub that runs already and does not start a second hub", async () => {
    const harness = createHarness(true);

    harness.supervisor.start();
    await harness.advanceClock(20_000);

    expect(harness.startedProcesses).toHaveLength(0);
    expect(harness.supervisor.mode).toBe("external");
  });

  it("starts its own hub when the external hub stops for two checks", async () => {
    const harness = createHarness(true);
    harness.supervisor.start();
    await harness.advanceClock(0);

    harness.setHubHealthy(false);
    await harness.advanceClock(5_000);
    expect(harness.startedProcesses).toHaveLength(0);
    await harness.advanceClock(3_000);

    expect(harness.startedProcesses).toHaveLength(1);
    expect(harness.supervisor.mode).toBe("supervised");
  });

  it("continues to use an external hub that restarts between two checks", async () => {
    const harness = createHarness(true);
    harness.supervisor.start();
    await harness.advanceClock(0);

    harness.setHubHealthy(false);
    await harness.advanceClock(5_000);
    harness.setHubHealthy(true);
    await harness.advanceClock(3_000);

    expect(harness.startedProcesses).toHaveLength(0);
    expect(harness.supervisor.mode).toBe("external");
  });

  it("restarts a stopped hub with a delay that increases after each failure", async () => {
    const harness = createHarness(false);
    harness.supervisor.start();
    await harness.advanceClock(0);

    harness.startedProcesses[0]?.exit(1);
    await harness.advanceClock(999);
    expect(harness.startedProcesses).toHaveLength(1);
    expect(harness.supervisor.mode).toBe("restarting");
    await harness.advanceClock(1);
    expect(harness.startedProcesses).toHaveLength(2);

    harness.startedProcesses[1]?.exit(1);
    await harness.advanceClock(1_999);
    expect(harness.startedProcesses).toHaveLength(2);
    await harness.advanceClock(1);
    expect(harness.startedProcesses).toHaveLength(3);
  });

  it("uses the initial restart delay again after a stable run", async () => {
    const harness = createHarness(false);
    harness.supervisor.start();
    await harness.advanceClock(0);
    harness.startedProcesses[0]?.exit(1);
    await harness.advanceClock(1_000);

    await harness.advanceClock(60_000);
    harness.startedProcesses[1]?.exit(1);
    await harness.advanceClock(1_000);

    expect(harness.startedProcesses).toHaveLength(3);
  });

  it("uses a hub that another process started while the supervisor waited", async () => {
    const harness = createHarness(false);
    harness.supervisor.start();
    await harness.advanceClock(0);

    harness.setHubHealthy(true);
    harness.startedProcesses[0]?.exit(1);
    await harness.advanceClock(1_000);

    expect(harness.startedProcesses).toHaveLength(1);
    expect(harness.supervisor.mode).toBe("external");
  });

  it("stops the hub process and does not restart it after stop", async () => {
    const harness = createHarness(false);
    harness.supervisor.start();
    await harness.advanceClock(0);
    const hubProcess = harness.startedProcesses[0];

    harness.supervisor.stop();
    hubProcess?.exit(null);
    await harness.advanceClock(60_000);

    expect(hubProcess?.stop).toHaveBeenCalledTimes(1);
    expect(harness.startedProcesses).toHaveLength(1);
    expect(harness.supervisor.mode).toBe("stopped");
  });
});

describe("localHubPort", () => {
  it("returns the port of a hub on this computer", () => {
    expect(localHubPort("http://127.0.0.1:43681")).toBe("43681");
    expect(localHubPort("http://localhost:44000")).toBe("44000");
  });

  it("returns undefined for a hub on a different computer", () => {
    expect(localHubPort("http://192.168.1.20:43681")).toBeUndefined();
  });
});
