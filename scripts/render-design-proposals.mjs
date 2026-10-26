import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cardStates as states, cardIdentities as identities, renderCard, renderControl, renderHostBadge } from "../src/shared/card-design.ts";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const directory = join(root, "docs", "design");
const specification = JSON.parse(await readFile(join(directory, "palettes", "tokens.json"), "utf8"));
const artwork = await readFile(join(directory, "assets", "icons.svg"), "utf8");
const definitions = artwork.match(/<defs>([\s\S]*?)<\/defs>/)?.[1];
assert(definitions, "Missing local icon definitions");

const icons = Object.fromEntries([...definitions.matchAll(/<symbol id="icon-([^"]+)" viewBox="([^"]+)">([\s\S]*?)<\/symbol>/g)]
  .map((match) => [match[1], { viewBox: match[2], content: match[3] }]));
assert(Object.keys(icons).length > 0, "Missing local icon artwork");

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]);
}

function text(content, horizontal, vertical, color, size = 12, attributes = "") {
  return `<text x="${horizontal}" y="${vertical}" fill="${color}" font-size="${size}" ${attributes}>${escapeXml(content)}</text>`;
}

function badge(host, palette, horizontal = 48, vertical = 4) {
  return renderHostBadge(host, palette, icons, horizontal, vertical);
}

function card(identity, state, palette, number) {
  return renderCard(identity, state, palette, number, icons);
}

function tile(identity, state, palette, number, horizontal, vertical, scale, prefix) {
  return `<g id="${prefix}-${identity.id}-${state.id}" transform="translate(${horizontal} ${vertical}) scale(${scale})">${card(identity, state, palette, number)}</g>`;
}

function control(icon, label, palette, horizontal, vertical) {
  return `<g transform="translate(${horizontal} ${vertical}) scale(1.25)" aria-label="${label} control">
${renderControl(icon, label, palette, icons)}
</g>`;
}

function frame(title, description, width, height, palette, content, extra = {}) {
  const metadata = {
    purpose: "Design reference; the live palette is configured through the hub",
    artwork: "Local Lobe Icons 1.100.0 and Lucide 0.468.0; see docs/design/THIRD_PARTY_NOTICES.txt",
    generatedBy: "scripts/render-design-proposals.mjs",
    previewPalette: palette.id,
    selectedPalette: specification.selectedPalette,
    ...extra,
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="visual-title visual-description">
<title id="visual-title">${escapeXml(title)}</title>
<desc id="visual-description">${escapeXml(description)}</desc>
<metadata>${escapeXml(JSON.stringify(metadata))}</metadata>
<rect width="${width}" height="${height}" fill="${palette.canvas}"/>
<g font-family="Arial, Helvetica, sans-serif">${content}</g>
</svg>
`;
}

function headers(palette) {
  return states.map((state, index) => text(state.label, 276 + index * 104, 127, palette.foreground, 10.7, 'text-anchor="middle" font-weight="700"')
    + text(state.detail, 276 + index * 104, 145, palette.muted, 10.2, 'text-anchor="middle"')).join("\n");
}

function fullSheet(palette) {
  const rows = identities.map((identity, row) => {
    const top = 176 + row * 104;
    return `<g id="row-${identity.id}">${text(identity.title, 36, top + 36, palette.foreground, 13, 'font-weight="700"')}${text(identity.detail, 36, top + 58, palette.muted)}${states.map((state, column) => tile(identity, state, palette, row + 1, 231 + column * 104, top, 1.25, "matrix")).join("\n")}</g>`;
  }).join("\n");
  const examples = [[0, 1, "Copilot · CLI"], [1, 2, "Copilot · IJ"], [4, 4, "Codex · new"], [4, 6, "Codex · aged"], [4, 7, "Codex · assessed"], [5, 9, "JetBrains AI"], [8, 1, "Claude · app"]];
  const samples = examples.map(([identity, state, label], index) => tile(identities[identity], states[state], palette, index + 1, 36 + index * 102, 1564, 1, "readability")
    + text(label, 72 + index * 102, 1655, palette.muted, 11, 'text-anchor="middle"')).join("\n");
  const content = `
${text(`AI AI CAPTAIN / ICON SYSTEM / ${palette.name.toUpperCase()}`, 36, 28, palette.muted, 11, 'font-weight="700" letter-spacing="2"')}
${text("One visual language. Every session.", 36, 67, palette.foreground, 31, 'font-weight="700"')}
${text(`${palette.name} reference · Full wording, Claude Desktop and assessed DONE · Live palette selectable in the dashboard.`, 36, 94, palette.muted, 13)}
${text("CLIENT / HOST", 36, 133, palette.muted, 11, 'font-weight="700" letter-spacing="1"')}
${headers(palette)}
${rows}
<path d="M36 1335H1268" stroke="${palette.badge.border}"/>
${text("Fixed controls", 36, 1364, palette.foreground, 17, 'font-weight="700"')}
${control("layout-dashboard", "INFO", palette, 36, 1385)}${control("chevron-left", "PREV", palette, 150, 1385)}${control("chevron-right", "NEXT", palette, 264, 1385)}
${text("NEUTRAL HOST BADGES", 411, 1399, palette.foreground, 12, 'font-weight="700" letter-spacing=".7"')}
<g transform="translate(411 1416) scale(1.6)">${badge("terminal", palette, 0, 0)}${badge("ide", palette, 32, 0)}${badge("app-window", palette, 64, 0)}</g>
${text("CLI / IntelliJ / desktop app", 411, 1459, palette.muted)}
${text("IDENTITY IS NOT THE MODEL", 716, 1399, palette.foreground, 12, 'font-weight="700" letter-spacing=".7"')}
${text("Copilot using Claude still uses Copilot goggles.", 716, 1424, palette.muted, 13)}
${text("Codex in JetBrains AI uses brackets + the IJ badge.", 716, 1446, palette.muted, 13)}
${text("Assessed DONE stops blinking immediately; unassessed DONE keeps its ten-minute fade. Frames shown are static.", 36, 1510, palette.muted)}
<path d="M36 1527H1268" stroke="${palette.badge.border}"/>
${text("72 px readability check", 36, 1552, palette.foreground, 17, 'font-weight="700"')}
${samples}
${text("Assessed = visited after completion.", 822, 1584, palette.foreground, 13, 'font-weight="700"')}
${text("Darker than aged DONE, with a double check.", 822, 1608, palette.muted, 13)}
${text("A new turn clears assessment. App focus alone cannot assess all sessions.", 822, 1630, palette.muted, 11)}
<path d="M36 1677H1268" stroke="${palette.badge.border}"/>
${text("Selected brand marks: Lobe Icons 1.100.0. Interface symbols: Lucide 0.468.0. Local assets; licenses accompany these previews.", 36, 1701, palette.muted, 10.5)}
${text("DESIGN REFERENCE · Assessed DONE detection remains unimplemented · Illustrated products do not imply automatic conversation telemetry.", 36, 1721, palette.muted, 10.5)}`;
  return frame(`AI AI Captain: ${palette.name} complete icon and state combinations`, "Eleven client/host combinations across ten state and brightness examples: STARTING, WORKING, WAITING bright/dim, DONE fresh/dim/aged/assessed, FAILED and UNK. Claude Desktop, fixed controls and seven 72-pixel samples are included. Assessed DONE is darkest and double-checked but visit detection is not implemented. Choose the live palette in the dashboard.", 1304, 1740, palette, content);
}

const neutral = { id: "comparison", canvas: "#0B1019", foreground: "#F4F6FA", muted: "#AAB7C7" };

function assessment() {
  const completionStates = [states[4], states[6], states[7]];
  const rows = specification.palettes.map((palette, row) => {
    const top = 146 + row * 198;
    return `<g id="assessment-${palette.id}"><rect x="20" y="${top - 16}" width="1010" height="184" rx="12" fill="${palette.canvas}"/>
${text(palette.name, 36, top + 56, palette.foreground, 22, 'font-weight="700"')}
${text(palette.contrast === "high" ? `High contrast · ${palette.mode}` : palette.description[0], 36, top + 82, palette.muted)}
${completionStates.map((state, column) => tile(identities[4], state, palette, 5, 252 + column * 256, top, 2, `assessment-${palette.id}`)
  + text(column === 0 ? "Bright alert · single check" : column === 1 ? "Dark blue · single check" : "Darkest blue · double check", 324 + column * 256, top + 164, palette.muted, 12, 'text-anchor="middle"')).join("\n")}</g>`;
  }).join("\n");
  return frame("AI AI Captain: DONE assessment in all five palettes", "Fresh, aged and assessed completed sessions are compared across all five palettes, including dark and light high contrast. A verified visit after completion can assess the result at any age. Assessment cancels blinking, uses the darkest blue and a double check, and resets on a new turn. It remains a design requirement, not implemented visit tracking.", 1050, 1274, neutral, `
${text("DONE keeps its meaning. Assessment changes attention.", 36, 48, neutral.foreground, 26, 'font-weight="700"')}
${text("All five palettes · Same session · Same scale · Assessment is required, not implemented.", 36, 80, neutral.muted, 13)}
${text("Fresh · not assessed", 324, 118, neutral.foreground, 12, 'text-anchor="middle"')}
${text("After 10 min · not assessed", 580, 118, neutral.foreground, 12, 'text-anchor="middle"')}
${text("Visited after completion · assessed", 836, 118, neutral.foreground, 12, 'text-anchor="middle"')}
${rows}<path d="M36 1156H1014" stroke="#43546A"/>
${text("A verified visit can assess a completed result immediately, at any age; there is no ten-minute prerequisite.", 36, 1186, neutral.muted, 13)}
${text("New work resets assessment. App/project activation alone cannot assess every session in that host.", 36, 1210, neutral.muted, 13)}
${text("Static design frames · No palette selection, runtime deployment or visit-detection implementation is implied.", 36, 1244, neutral.muted, 11)}`);
}

function luminance(color) {
  assert.match(color, /^#[0-9a-f]{6}$/i, "Invalid color token");
  const channels = [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16) / 255)
    .map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}

function contrast(first, second) {
  const values = [luminance(first), luminance(second)].sort((left, right) => left - right);
  return (values[1] + .05) / (values[0] + .05);
}

function validatePalette(palette) {
  assert.equal(Object.keys(palette.states).length, states.length, `${palette.id}: incomplete states`);
  const pairs = {
    captions: [[palette.muted, palette.canvas], [palette.foreground, palette.canvas]],
    hostBadges: [[palette.badge.foreground, palette.badge.background]],
    controls: [[palette.controls.ink, palette.controls.accent], [palette.controls.foreground, palette.controls.background]],
    stateLabels: states.map((state) => [palette.states[state.id].ink, palette.states[state.id].accent]),
    identityMarks: states.map((state) => [palette.states[state.id].foreground, palette.states[state.id].background]),
  };
  const minimums = Object.fromEntries(Object.entries(pairs).map(([role, colors]) => [role, Math.min(...colors.map(([foreground, background]) => contrast(foreground, background)))]));
  for (const [role, minimum] of Object.entries(minimums)) assert(minimum >= palette.minimumTextContrast, `${palette.id}: ${role} contrast ${minimum.toFixed(2)} below target`);
  for (const role of ["accent", "background"]) {
    const levels = ["done-bright", "done-dim", "done-aged", "done-assessed"].map((state) => luminance(palette.states[state][role]));
    for (let index = 1; index < levels.length; index++) assert(levels[index - 1] > levels[index], `${palette.id}: DONE ${role} hierarchy`);
  }
  return { id: palette.id, name: palette.name, target: palette.minimumTextContrast, minimums: Object.fromEntries(Object.entries(minimums).map(([role, value]) => [role, Number(value.toFixed(3))])) };
}

function validateSvg(svg) {
  const identifiers = [...svg.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(identifiers.length, new Set(identifiers).size, "Duplicate SVG IDs");
  for (const match of svg.matchAll(/\bhref="([^"]+)"/g)) assert(match[1].startsWith("#") && identifiers.includes(match[1].slice(1)), "Missing or external SVG reference");
  assert(!/<script|<image|<foreignObject|\son\w+=/i.test(svg), "Unexpected executable/external SVG content");
  assert(!/>RUNNING<|>RUN<|>WAIT<|>START<|>FAIL</.test(svg), "Outdated display wording");
}

assert.equal(specification.schemaVersion, 2);
assert.equal(new Set(specification.palettes.map((palette) => palette.id)).size, specification.palettes.length);
const preview = specification.palettes.find((palette) => palette.id === specification.previewPalette);
assert(preview, "Missing preview palette");
assert(specification.selectedPalette === null || specification.palettes.some((palette) => palette.id === specification.selectedPalette), "Missing selected default palette");
const report = { scope: "Text and identity contrast checks, not a claim of complete accessibility certification", palettes: specification.palettes.map(validatePalette) };
const outputs = new Map([
  ["palettes/default.svg", fullSheet(preview)],
  ["done-assessment.svg", assessment()],
  ...specification.palettes.map((palette) => [`palettes/${palette.id}.svg`, fullSheet(palette)]),
]);
for (const svg of outputs.values()) validateSvg(svg);
outputs.set("palette-contrast.json", `${JSON.stringify(report, null, 2)}\n`);
const runtimeAssets = `import type { CardPalette, CardIcons } from "./card-design.js";\n\nexport const defaultPaletteId = ${JSON.stringify(specification.selectedPalette ?? specification.previewPalette)} as const;\n\nexport const designPalettes = ${JSON.stringify(specification.palettes, null, 2)} as const satisfies readonly CardPalette[];\n\nexport const cardIcons = ${JSON.stringify(icons, null, 2)} as const satisfies CardIcons;\n`;
outputs.set("../../src/shared/card-assets.ts", runtimeAssets);
outputs.set("../../web/THIRD_PARTY_NOTICES.txt", await readFile(join(directory, "THIRD_PARTY_NOTICES.txt"), "utf8"));

const write = process.argv.includes("--write");
const check = process.argv.includes("--check");
const png = process.argv.includes("--png");
assert(write !== check && (!png || write), "Use --check, or --write [--png]");
for (const [relative, content] of outputs) {
  const path = join(directory, relative);
  if (check) assert.equal(await readFile(path, "utf8"), content, `${relative} is stale; regenerate the design previews`);
  else {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
    if (png && relative.endsWith(".svg")) execFileSync("rsvg-convert", [path, "-o", path.replace(/\.svg$/, ".png")]);
  }
}
console.info(`${check ? "Checked" : "Generated"} ${[...outputs.keys()].filter((path) => path.endsWith(".svg")).length} SVG references, runtime assets, notices and a contrast report. High-contrast palettes meet 7:1 targets in every state and animation phase.`);
