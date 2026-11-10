import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  budgetProviders,
  renderActionIcon,
  renderBudgetCard,
  renderControl,
  renderDashboardKey,
  renderInfoPlaceholder,
  renderSessionPlaceholder,
  renderSettingCard,
  renderCleanCard,
  inKeySafeArea,
} from "../../src/shared/card-design.ts";
import { cardIcons, designPalettes, defaultPaletteId } from "../../src/shared/card-assets.ts";
import { pluginDirectory as destination, repositoryRoot as root } from "./plugin-tools.mjs";

const source = join(root, "streamdeck");
await mkdir(destination, { recursive: true });
await cp(join(source, "manifest.json"), join(destination, "manifest.json"));
await cp(join(root, "docs", "design", "THIRD_PARTY_NOTICES.txt"), join(destination, "THIRD_PARTY_NOTICES.txt"));
await rm(join(destination, "bin", "plugin.js"), { force: true });
// The plugin starts the hub, and the hub serves the dashboard from this copy of the static files.
await rm(join(destination, "web"), { recursive: true, force: true });
await cp(join(root, "web"), join(destination, "web"), { recursive: true });
await rm(join(destination, "imgs"), { recursive: true, force: true });
await mkdir(join(destination, "imgs"), { recursive: true });

/** Draws the plugin icon as a PNG file. scale 2 gives the image for high-density screens. */
function pluginIconPng(scale = 1) {
  const baseSize = 72;
  const width = baseSize * scale;
  const height = baseSize * scale;
  const pixels = Buffer.alloc(width * height * 4);
  const set = (x, y, color) => {
    const scaledX = x * scale;
    const scaledY = y * scale;
    if (scaledX < 0 || scaledY < 0 || scaledX >= width || scaledY >= height) return;
    for (let offsetY = 0; offsetY < scale; offsetY++)
      for (let offsetX = 0; offsetX < scale; offsetX++) {
        const offset = ((scaledY + offsetY) * width + scaledX + offsetX) * 4;
        pixels.set(color, offset);
      }
  };
  const rectangle = (left, top, right, bottom, color) => {
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) set(x, y, color);
  };
  rectangle(0, 0, baseSize, baseSize, [21, 27, 43, 255]);
  // Four colored squares on a dark key background.
  rectangle(12, 12, 32, 32, [139, 157, 255, 255]);
  rectangle(40, 12, 60, 32, [81, 214, 161, 255]);
  rectangle(12, 40, 32, 60, [255, 190, 99, 255]);
  rectangle(40, 40, 60, 60, [86, 98, 116, 255]);
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) pixels.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  const crc32 = (data) => {
    let crc = 0xffffffff;
    for (const byte of data) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const name = Buffer.from(type);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
    return Buffer.concat([length, name, data, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

await writeFile(join(destination, "imgs", "plugin.png"), pluginIconPng());
await writeFile(join(destination, "imgs", "plugin@2x.png"), pluginIconPng(2));

// The Stream Deck app shows these images in the action list and on a key before the plugin draws it.
// They use the shared renderer and the default palette, so they look like the live keys.
const keyPalette = designPalettes.find((palette) => palette.id === defaultPaletteId);
const keySvg = (content) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 72 72"><g font-family="Arial, Helvetica, sans-serif">${inKeySafeArea(content)}</g></svg>\n`;
const notReported = (provider) => ({
  provider,
  windows: provider === "copilot" || provider === "jetbrains" ? [{ label: "MO" }] : [{ label: "5H" }, { label: "WK" }],
});
const keyImages = {
  session: renderSessionPlaceholder(keyPalette),
  clean: renderCleanCard(0, keyPalette),
  "session-info": renderInfoPlaceholder(keyPalette),
  "previous-page": renderControl("chevron-left", "PREV", keyPalette, cardIcons),
  "next-page": renderControl("chevron-right", "NEXT", keyPalette, cardIcons),
  dashboard: renderDashboardKey(keyPalette, cardIcons),
  "toggle-info-keys": renderSettingCard({ kind: "info-keys", on: true }, keyPalette, cardIcons),
  "cycle-theme": renderSettingCard({ kind: "theme", paletteName: keyPalette.name }, keyPalette, cardIcons),
  "cycle-brightness": renderSettingCard({ kind: "brightness", level: 2, maximumLevel: 4 }, keyPalette, cardIcons),
  ...Object.fromEntries(budgetProviders.map((provider) => [`budget-${provider.id}`, renderBudgetCard(notReported(provider.id), keyPalette, cardIcons)])),
};
await mkdir(join(destination, "imgs", "actions"), { recursive: true });
await mkdir(join(destination, "imgs", "keys"), { recursive: true });
for (const [id, content] of Object.entries(keyImages)) {
  await writeFile(join(destination, "imgs", "actions", `${id}.svg`), renderActionIcon(id, cardIcons));
  await writeFile(join(destination, "imgs", "keys", `${id}.svg`), keySvg(content));
}

const profileId = randomUUID().toUpperCase();
const pageId = randomUUID();
const profileTemp = await mkdtemp(join(tmpdir(), "ai-ai-captain-xl-"));
const profileRoot = join(profileTemp, `${profileId}.sdProfile`);
const pageRoot = join(profileRoot, "Profiles", pageId);
await mkdir(join(pageRoot, "Images"), { recursive: true });
const rootManifest = {
  Device: { Model: "20GAT9901", UUID: "" },
  Name: "AI AI Captain XL",
  Pages: { Current: pageId, Default: pageId, Pages: [pageId] },
  Version: "2.0",
};
const actionStates = [
  { FontFamily: "", FontSize: 11, FontStyle: "", FontUnderline: false, OutlineThickness: 2, ShowTitle: true, TitleAlignment: "bottom", TitleColor: "#ffffff" },
];
const actions = {};
for (let slot = 0; slot < 32; slot++) {
  const row = Math.floor(slot / 8);
  const column = slot % 8;
  const actionId =
    slot === 30 ? "com.local.ai-ai-captain.previous-page" : slot === 31 ? "com.local.ai-ai-captain.next-page" : "com.local.ai-ai-captain.session";
  const name = slot === 30 ? "Previous Session Page" : slot === 31 ? "Next Session Page" : "AI Session";
  actions[`${column},${row}`] = { ActionID: randomUUID(), LinkedTitle: true, Name: name, Settings: {}, State: 0, States: actionStates, UUID: actionId };
}
await writeFile(join(profileRoot, "manifest.json"), JSON.stringify(rootManifest));
await writeFile(join(pageRoot, "manifest.json"), JSON.stringify({ Controllers: [{ Actions: actions, Type: "Keypad" }], Icon: "", Name: "AI AI Captain XL" }));
const profileDirectory = join(destination, "profiles");
await mkdir(profileDirectory, { recursive: true });
const profileArchive = join(profileDirectory, "ai-ai-captain-xl.streamDeckProfile");
// Windows has no zip command. Its tar command (bsdtar) makes zip files.
if (process.platform === "win32") {
  execFileSync("tar", ["-a", "-c", "-f", profileArchive, `${profileId}.sdProfile`], { cwd: profileTemp });
} else {
  execFileSync("zip", ["-qr", profileArchive, `${profileId}.sdProfile`], { cwd: profileTemp });
}
await rm(profileTemp, { recursive: true, force: true });
