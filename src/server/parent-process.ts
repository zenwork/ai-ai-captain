const parentCheckIntervalMilliseconds = 2_000;

export interface ParentProcessWatchOptions {
  readParentProcessIdentifier?: () => number;
  checkIntervalMilliseconds?: number;
}

/**
 * Calls `onParentExit` one time when the parent process stops.
 *
 * When a parent process stops, macOS gives its child processes to `launchd`. Thus a change of the parent process
 * identifier shows that the parent stopped. This check is also correct when macOS gives the old identifier to a new process.
 *
 * @returns A function that stops the watch.
 */
export function watchParentProcess(onParentExit: () => void, options: ParentProcessWatchOptions = {}): () => void {
  const readParentProcessIdentifier = options.readParentProcessIdentifier ?? (() => process.ppid);
  const checkIntervalMilliseconds = options.checkIntervalMilliseconds ?? parentCheckIntervalMilliseconds;
  const originalParentProcessIdentifier = readParentProcessIdentifier();

  const timer = setInterval(() => {
    if (readParentProcessIdentifier() === originalParentProcessIdentifier) return;
    clearInterval(timer);
    onParentExit();
  }, checkIntervalMilliseconds);

  // The watch must not keep the hub alive without other work.
  timer.unref();

  return () => {
    clearInterval(timer);
  };
}
