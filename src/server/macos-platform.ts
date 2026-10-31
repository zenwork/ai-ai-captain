import { afterAll, beforeAll } from "vitest";

/** Makes tests that use macOS app bundles behave the same on all systems. */
export function useMacosPlatform(): void {
  const original = Object.getOwnPropertyDescriptor(process, "platform");
  beforeAll(() => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
  });
  afterAll(() => {
    if (original) Object.defineProperty(process, "platform", original);
  });
}
