import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

/** The hub serves the deck from `web/`. Build it each time, so that the tests never use old files. */
export default function buildDashboard(): void {
  execFileSync("npm", ["run", "build:web"], { cwd: repositoryRoot, stdio: "ignore" });
}
