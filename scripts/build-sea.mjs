import { build } from "esbuild";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const outputDirectory = join(root, "dist");
await mkdir(outputDirectory, { recursive: true });
const platformName = process.platform === "win32" ? "win" : process.platform;
const architectureName = process.arch === "arm64" ? "arm64" : process.arch === "x64" ? "x64" : process.arch;
const releaseName = `node-v${process.versions.node}-${platformName}-${architectureName}`;
const seaNode = join(outputDirectory, "sea-node", "bin", process.platform === "win32" ? "node.exe" : "node");
const fuse = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";

function hasSeaFuse(executable) {
  const result = spawnSync("strings", [executable], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  return result.status === 0 && result.stdout.includes(fuse);
}

if (!hasSeaFuse(process.execPath)) {
  if (!hasSeaFuse(seaNode)) {
    const archivePath = join(outputDirectory, `${releaseName}.tar.gz`);
    const response = await fetch(`https://nodejs.org/dist/v${process.versions.node}/${releaseName}.tar.gz`);
    if (!response.ok) throw new Error(`Could not download official Node.js ${process.versions.node} for SEA: HTTP ${response.status}`);
    await writeFile(archivePath, Buffer.from(await response.arrayBuffer()));
    await mkdir(dirname(seaNode), { recursive: true });
    const extraction = spawnSync("tar", ["-xzf", archivePath, "-C", join(outputDirectory, "sea-node"), "--strip-components=1", `${releaseName}/bin/node`], { stdio: "inherit" });
    if (extraction.status !== 0 || !hasSeaFuse(seaNode)) throw new Error("The downloaded Node.js executable does not support SEA. Set AI_AI_CAPTAIN_SEA_NODE to an official Node.js binary.");
  }
}

const bundledMain = join(outputDirectory, "sea-main.cjs");
await build({ entryPoints: [join(root, "src/server/main.ts")], bundle: true, platform: "node", format: "cjs", outfile: bundledMain, packages: "bundle", banner: { js: "process.env.AI_AI_CAPTAIN_SEA = '1';" } });
const configPath = join(outputDirectory, "sea-config.json");
const executable = process.env.AI_AI_CAPTAIN_SEA_NODE ?? (hasSeaFuse(process.execPath) ? process.execPath : seaNode);
if (!hasSeaFuse(executable)) throw new Error(`Node executable does not contain the SEA fuse: ${executable}`);
await writeFile(configPath, JSON.stringify({ main: bundledMain, executable, output: join(outputDirectory, "ai-ai-captain"), disableExperimentalSEAWarning: true }));
const result = spawnSync(process.execPath, [`--build-sea=${configPath}`], { stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);
if (process.platform === "darwin") {
  const signing = spawnSync("codesign", ["--sign", "-", "--force", join(outputDirectory, "ai-ai-captain")], { stdio: "inherit" });
  if (signing.status !== 0) throw new Error("Could not ad-hoc sign the macOS executable");
  const verification = spawnSync("codesign", ["--verify", "--strict", join(outputDirectory, "ai-ai-captain")], { stdio: "inherit" });
  if (verification.status !== 0) throw new Error("The macOS executable failed code-signature verification");
}
await mkdir(join(outputDirectory, "web"), { recursive: true });
for (const file of ["index.html", "styles.css", "app.js"]) await copyFile(join(root, "web", file), join(outputDirectory, "web", file));
console.info(`Built and ad-hoc signed ${join(outputDirectory, "ai-ai-captain")}; use Developer ID signing for distribution.`);
