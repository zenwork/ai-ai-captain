import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { watchParentProcess } from "./parent-process.js";

describe("watchParentProcess", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not call the callback while the parent process runs", () => {
    const onParentExit = vi.fn();
    watchParentProcess(onParentExit, { readParentProcessIdentifier: () => 4_321, checkIntervalMilliseconds: 1_000 });

    vi.advanceTimersByTime(10_000);

    expect(onParentExit).not.toHaveBeenCalled();
  });

  it("calls the callback one time when the parent process identifier changes", () => {
    let parentProcessIdentifier = 4_321;
    const onParentExit = vi.fn();
    watchParentProcess(onParentExit, { readParentProcessIdentifier: () => parentProcessIdentifier, checkIntervalMilliseconds: 1_000 });

    parentProcessIdentifier = 1;
    vi.advanceTimersByTime(5_000);

    expect(onParentExit).toHaveBeenCalledTimes(1);
  });

  it("stops the watch when the returned function is called", () => {
    let parentProcessIdentifier = 4_321;
    const onParentExit = vi.fn();
    const stopWatch = watchParentProcess(onParentExit, { readParentProcessIdentifier: () => parentProcessIdentifier, checkIntervalMilliseconds: 1_000 });

    stopWatch();
    parentProcessIdentifier = 1;
    vi.advanceTimersByTime(5_000);

    expect(onParentExit).not.toHaveBeenCalled();
  });
});
