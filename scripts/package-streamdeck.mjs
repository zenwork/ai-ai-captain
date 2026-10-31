import { fileURLToPath } from "node:url";
import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = join(root, "streamdeck");
const destination = join(source, "com.local.ai-ai-captain.sdPlugin");
await mkdir(destination, { recursive: true });
await cp(join(source, "manifest.json"), join(destination, "manifest.json"));
await cp(join(root, "docs", "design", "THIRD_PARTY_NOTICES.txt"), join(destination, "THIRD_PARTY_NOTICES.txt"));
await rm(join(destination, "bin", "plugin.js"), { force: true });
// The plugin starts the hub, and the hub serves the dashboard from this copy of the static files.
await rm(join(destination, "web"), { recursive: true, force: true });
await cp(join(root, "web"), join(destination, "web"), { recursive: true });
await rm(join(destination, "imgs"), { recursive: true, force: true });
await mkdir(join(destination, "imgs"), { recursive: true });

function iconPng(kind, scale = 1) {
  const baseSize = 72;
  const width = baseSize * scale;
  const height = baseSize * scale;
  const pixels = Buffer.alloc(width * height * 4);
  const set = (x, y, color) => {
    const scaledX = x * scale;
    const scaledY = y * scale;
    if (scaledX < 0 || scaledY < 0 || scaledX >= width || scaledY >= height) return;
    for (let offsetY = 0; offsetY < scale; offsetY++) for (let offsetX = 0; offsetX < scale; offsetX++) {
      const offset = ((scaledY + offsetY) * width + scaledX + offsetX) * 4;
      pixels.set(color, offset);
    }
  };
  const rectangle = (left, top, right, bottom, color) => {
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) set(x, y, color);
  };
  const line = (x0, y0, x1, y1, color, thickness = 6) => {
    const dx = Math.abs(x1 - x0);
    const sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0);
    const sy = y0 < y1 ? 1 : -1;
    let error = dx + dy;
    while (true) {
      for (let y = y0 - thickness; y <= y0 + thickness; y++) for (let x = x0 - thickness; x <= x0 + thickness; x++) {
        if ((x - x0) ** 2 + (y - y0) ** 2 <= thickness ** 2) set(x, y, color);
      }
      if (x0 === x1 && y0 === y1) break;
      const doubled = 2 * error;
      if (doubled >= dy) { error += dy; x0 += sx; }
      if (doubled <= dx) { error += dx; y0 += sy; }
    }
  };
  rectangle(0, 0, baseSize, baseSize, [21, 27, 43, 255]);
  if (kind === "plugin") {
    rectangle(12, 12, 32, 32, [139, 157, 255, 255]);
    rectangle(40, 12, 60, 32, [81, 214, 161, 255]);
    rectangle(12, 40, 32, 60, [255, 190, 99, 255]);
    rectangle(40, 40, 60, 60, [86, 98, 116, 255]);
  } else if (kind === "session") {
    line(36, 14, 36, 58, [139, 157, 255, 255], 2);
    line(14, 36, 58, 36, [139, 157, 255, 255], 2);
    line(21, 21, 51, 51, [139, 157, 255, 255], 2);
    line(21, 51, 51, 21, [139, 157, 255, 255], 2);
  } else if (kind === "dashboard") {
    rectangle(13, 10, 59, 43, [239, 241, 245, 255]);
    rectangle(16, 13, 56, 40, [30, 16, 54, 255]);
    rectangle(16, 18, 56, 21, [239, 241, 245, 255]);
    rectangle(34, 25, 38, 29, [196, 181, 253, 255]);
    rectangle(34, 32, 38, 38, [196, 181, 253, 255]);
    rectangle(13, 50, 59, 56, [196, 181, 253, 255]);
  } else {
    rectangle(0, 0, width, height, [32, 40, 58, 255]);
    const points = kind === "previous" ? [[45, 18, 25, 36], [25, 36, 45, 54]] : [[27, 18, 47, 36], [47, 36, 27, 54]];
    for (const [x0, y0, x1, y1] of points) line(x0, y0, x1, y1, [239, 241, 245, 255]);
  }
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
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

for (const icon of ["plugin", "session", "previous", "next", "dashboard"]) {
  await writeFile(join(destination, "imgs", `${icon}.png`), iconPng(icon));
  if (icon !== "plugin") await writeFile(join(destination, "imgs", `${icon}@2x.png`), iconPng(icon, 2));
}
await writeFile(join(destination, "imgs", "plugin@2x.png"), iconPng("plugin", 2));

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
const actionStates = [{ FontFamily: "", FontSize: 11, FontStyle: "", FontUnderline: false, OutlineThickness: 2, ShowTitle: true, TitleAlignment: "bottom", TitleColor: "#ffffff" }];
const actions = {};
for (let slot = 0; slot < 32; slot++) {
  const row = Math.floor(slot / 8);
  const column = slot % 8;
  const actionId = slot === 30 ? "com.local.ai-ai-captain.previous-page" : slot === 31 ? "com.local.ai-ai-captain.next-page" : "com.local.ai-ai-captain.session";
  const name = slot === 30 ? "Previous Session Page" : slot === 31 ? "Next Session Page" : "AI Session";
  actions[`${column},${row}`] = { ActionID: randomUUID(), LinkedTitle: true, Name: name, Settings: {}, State: 0, States: actionStates, UUID: actionId };
}
await writeFile(join(profileRoot, "manifest.json"), JSON.stringify(rootManifest));
await writeFile(join(pageRoot, "manifest.json"), JSON.stringify({ Controllers: [{ Actions: actions, Type: "Keypad" }], Icon: "", Name: "AI AI Captain XL" }));
const profileDirectory = join(destination, "profiles");
await mkdir(profileDirectory, { recursive: true });
const profileArchive = join(profileDirectory, "ai-ai-captain-xl.streamDeckProfile");
execFileSync("zip", ["-qr", profileArchive, `${profileId}.sdProfile`], { cwd: profileTemp });
await rm(profileTemp, { recursive: true, force: true });
