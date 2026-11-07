import { defineConfig } from "vitest/config";

// End-to-end tests start the real hub and real processes. They are slow, so `npm test` does not run them.
export default defineConfig({
  test: {
    environment: "node",
    include: ["e2e/**/*.e2e.test.ts"],
    globalSetup: ["e2e/harness/global-setup.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // Each test starts a hub and processes. Run one file at a time, so the scans do not slow each other.
    fileParallelism: false,
  },
});
