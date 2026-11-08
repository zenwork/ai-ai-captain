import { describe, expect, it } from "vitest";
import { isJunieSimulationSupported } from "../harness/junie.js";
import { junieLifecycle } from "./junie-lifecycle.js";

describe.skipIf(!isJunieSimulationSupported)("junie life cycle", () => {
  it("walks through the life cycle", async () => {
    await expect(junieLifecycle().run()).resolves.toBeUndefined();
  });
});
