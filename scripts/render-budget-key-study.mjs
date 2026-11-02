// Make the subscription budget key study: docs/design/subscription-budget-key.svg.
// Design proposal only. The runtime renderer does not use this file.
// Usage: node scripts/render-budget-key-study.mjs [palette-id]
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const directory = join(root, "docs", "design");
const tokens = JSON.parse(await readFile(join(directory, "palettes", "tokens.json"), "utf8"));
const artwork = await readFile(join(directory, "assets", "icons.svg"), "utf8");
const icons = Object.fromEntries(
  [...artwork.matchAll(/<symbol id="icon-([^"]+)" viewBox="([^"]+)">([\s\S]*?)<\/symbol>/g)].map((match) => [
    match[1],
    { viewBox: match[2], content: match[3] },
  ]),
);
// Lucide 0.468.0 "rotate-ccw", the same library as the other interface symbols.
icons["rotate-ccw"] ??= {
  viewBox: "0 0 24 24",
  content:
    '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 3v5h5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
};

const paletteId = process.argv[2] ?? "fjord";
const byId = Object.fromEntries(tokens.palettes.map((palette) => [palette.id, palette]));
let palette = byId[paletteId];
if (!palette) throw new Error(`Unknown palette: ${paletteId}`);

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]);
}
function text(content, x, y, color, size = 12, attributes = "") {
  return `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" ${attributes}>${escapeXml(content)}</text>`;
}
function icon(name, x, y, width, height, color) {
  const art = icons[name];
  if (!art) throw new Error(`Missing icon: ${name}`);
  const [minX, minY, sourceWidth, sourceHeight] = art.viewBox.trim().split(/\s+/).map(Number);
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const offsetX = x + (width - sourceWidth * scale) / 2 - minX * scale;
  const offsetY = y + (height - sourceHeight * scale) / 2 - minY * scale;
  return `<g transform="translate(${offsetX.toFixed(2)} ${offsetY.toFixed(2)}) scale(${scale.toFixed(4)})">${art.content.replaceAll("currentColor", color)}</g>`;
}

// The same 80% mark and warning rule as the context bar of the info key.
const warningPercent = 80;
const providers = {
  claude: { title: "CLAUDE", icon: "claude" },
  openai: { title: "OPENAI", icon: "openai" },
  copilot: { title: "GITHUB COPILOT", icon: "githubcopilot" },
  jetbrains: { title: "JETBRAINS AI", icon: "jetbrains" },
};

function mark(provider, color, background) {
  if (provider.icon === "jetbrains") {
    return `<rect x="6" y="5" width="12" height="12" rx="2" fill="${color}"/>${text("IJ", 12, 14.4, background, 8, 'text-anchor="middle" font-weight="800"')}${icon("sparkles", 15.5, 2.5, 6, 6, color)}`;
  }
  return icon(provider.icon, 5, 4, 14, 14, color);
}

function severity(percent) {
  if (percent === undefined) return "unknown";
  if (percent >= 100) return "out";
  if (percent >= warningPercent) return "low";
  return "ok";
}

// One budget bar. A label on the left, the bar on the right, a mark at 80%.
function bar(label, percent, y, colors) {
  const left = 21;
  const width = 45;
  const reported = percent !== undefined;
  const level = severity(percent);
  const fillColor = level === "out" ? colors.out : level === "low" ? colors.low : colors.ok;
  const fill = reported
    ? `<rect x="${left + 1.5}" y="${y + 1.5}" width="${((width - 3) * Math.min(percent, 100)) / 100}" height="${7}" rx="2" fill="${fillColor}"/>`
    : "";
  const markX = left + (width * warningPercent) / 100 - 1.5;
  return `${text(label, 6, y + 8.4, palette.muted, 8.5, 'font-weight="700"')}
<rect x="${left}" y="${y}" width="${width}" height="10" rx="3" fill="none" stroke="${palette.badge.border}" stroke-width="1.2"${reported ? "" : ' stroke-dasharray="2.5 2.5"'}/>${fill}
<line x1="${markX}" y1="${y - 1}" x2="${markX}" y2="${y + 11}" stroke="${palette.muted}" stroke-width="1"/>`;
}

// A state band like the band of a session key: symbol on the left, label in the middle.
function band(label, colors, symbol) {
  const scaled = label.length > 5;
  const label_ = scaled
    ? text(
        label,
        0,
        64.1,
        colors.ink,
        11,
        `transform="translate(45.5 0) scale(${label.length >= 7 ? ".78" : ".86"} 1)" text-anchor="middle" font-weight="800" letter-spacing=".1"`,
      )
    : text(label, 44, 64.1, colors.ink, 12, 'text-anchor="middle" font-weight="800" letter-spacing=".1"');
  return `<rect x="3" y="51" width="66" height="18" rx="4" fill="${colors.accent}"/>
${icon(symbol, 7, 53.5, 14, 14, colors.ink)}
${label_}`;
}

// A value in the top row with a symbol before it. The symbol moves with the length of the value.
function topValue(value, symbol, color) {
  const width = String(value).length * 6.1;
  return `${symbol ? icon(symbol, 66 - width - 13, 6, 10, 10, color) : ""}${text(value, 66, 15, color, 10, 'text-anchor="end" font-weight="700"')}`;
}

/**
 * data: { provider, plan, windows: [{ label, percent, reset }], used, total, extra: { kind, label } }
 * The key uses the canvas color like the info key. The border shows the worst level.
 */
function budgetKey(data) {
  const provider = providers[data.provider];
  const colors = { ok: palette.states.working.accent, low: palette.states["waiting-bright"].accent, out: palette.states.failed.accent };
  const windows = data.windows ?? [];
  const percents = windows.map((window) => window.percent).filter((value) => value !== undefined);
  const worst = percents.length ? Math.max(...percents) : undefined;
  const binding = windows.find((window) => window.percent === worst);
  const level = severity(worst);
  const extra = data.extra;
  const border = level === "out" && !extra ? colors.out : level === "low" || extra ? colors.low : palette.badge.border;
  const parts = [
    `<rect width="72" height="72" rx="8" fill="${palette.canvas}"/>`,
    `<rect x="1" y="1" width="70" height="70" rx="7" fill="none" stroke="${border}" stroke-width="1.5"${level === "unknown" ? ' stroke-dasharray="3 3"' : ""}/>`,
    `<g>${mark(provider, palette.foreground, palette.canvas)}</g>`,
  ];
  const out = level === "out" && !extra;
  // Top right: the plan. When the budget is out, the reset time takes its place.
  if (out) {
    parts.push(topValue(binding.reset, "rotate-ccw", palette.foreground));
  } else if (extra) {
    parts.push(topValue(extra.amount, undefined, palette.states["waiting-bright"].accent));
  } else {
    parts.push(text(data.plan ?? "?", 66, 15, palette.muted, 9.5, 'text-anchor="end" font-weight="700"'));
  }
  if (windows.length === 1) {
    // Monthly credits: the amount used over the allowance, then one bar.
    parts.push(text(data.used ?? "?", 6, 32, data.used === undefined ? palette.muted : palette.foreground, 13, 'font-weight="700"'));
    const usedWidth = String(data.used ?? "?").length * 7.6 + 7;
    parts.push(text(`/ ${data.total ?? "?"}`, usedWidth + 2, 32, palette.muted, 9));
    parts.push(bar(windows[0].label, windows[0].percent, 37, colors));
  } else {
    parts.push(bar(windows[0].label, windows[0].percent, 22, colors));
    parts.push(bar(windows[1].label, windows[1].percent, 37, colors));
  }
  if (extra) {
    parts.push(band(extra.kind === "topup" ? "TOP-UP" : "EXTRA", palette.states["waiting-bright"], extra.kind === "topup" ? "sparkles" : "triangle-alert"));
  } else if (out) {
    parts.push(band("LIMIT", palette.states.failed, "triangle-alert"));
  } else if (level === "unknown") {
    parts.push(text("—", 6, 64, palette.muted, 11), text("?", 66, 64, palette.muted, 12, 'text-anchor="end" font-weight="800"'));
  } else {
    parts.push(icon("rotate-ccw", 6, 55.5, 9, 9, palette.muted), text(binding.reset, 17.5, 63.5, palette.foreground, 9.5));
    parts.push(text(`${Math.round(worst)}%`, 66, 64, level === "low" ? colors.low : palette.foreground, 11.5, 'text-anchor="end" font-weight="800"'));
  }
  const description = `${provider.title} ${data.plan ?? ""} budget: ${windows.map((window) => `${window.label} ${window.percent ?? "not reported"} percent, reset ${window.reset ?? "unknown"}`).join("; ")}${extra ? `; ${extra.kind === "topup" ? "top-up credits in use" : "extra budget in use"}, ${extra.amount}` : ""}`;
  return `<g aria-label="${escapeXml(description)}">${parts.join("\n")}</g>`;
}

// The session key, drawn as in the shared renderer, to show the budget key in its family.
function sessionCard(title, iconName, stateId, label, symbol) {
  const colors = palette.states[stateId];
  const markArt =
    iconName === "jetbrains"
      ? `<rect x="21" y="19" width="28" height="28" rx="3" fill="${colors.foreground}"/>${text("IJ", 35, 39, colors.background, 20, 'text-anchor="middle" font-weight="800"')}${icon("sparkles", 45, 17, 13, 13, colors.foreground)}`
      : icon(iconName, 17, 19, 38, 29, colors.foreground);
  return `<g aria-label="${escapeXml(`${title}: ${label}`)}"><rect width="72" height="72" rx="8" fill="${colors.background}"/><rect x="1" y="1" width="70" height="70" rx="7" fill="none" stroke="${colors.accent}" stroke-width="1.5"/>${markArt}
${band(label, colors, symbol).replace(/^<rect[^>]*\/>/, `<rect x="3" y="51" width="66" height="18" rx="4" fill="${colors.accent}"/>`)}</g>`;
}

const examples = {
  claude: [
    {
      caption: "Normal",
      windows: [
        { label: "5H", percent: 34, reset: "2h05" },
        { label: "WK", percent: 21, reset: "4d" },
      ],
    },
    {
      caption: "Session window low",
      windows: [
        { label: "5H", percent: 86, reset: "1h12" },
        { label: "WK", percent: 40, reset: "4d" },
      ],
    },
    {
      caption: "Weekly window low",
      windows: [
        { label: "5H", percent: 12, reset: "4h30" },
        { label: "WK", percent: 91, reset: "2d" },
      ],
    },
    {
      caption: "Limit reached",
      windows: [
        { label: "5H", percent: 100, reset: "0h52" },
        { label: "WK", percent: 58, reset: "4d" },
      ],
    },
    { caption: "Not reported", plan: "?", windows: [{ label: "5H" }, { label: "WK" }] },
  ],
  openai: [
    {
      caption: "Normal",
      windows: [
        { label: "5H", percent: 18, reset: "3h40" },
        { label: "WK", percent: 47, reset: "5d" },
      ],
    },
    {
      caption: "Session window low",
      windows: [
        { label: "5H", percent: 82, reset: "0h35" },
        { label: "WK", percent: 60, reset: "5d" },
      ],
    },
    {
      caption: "Weekly window low",
      windows: [
        { label: "5H", percent: 30, reset: "2h10" },
        { label: "WK", percent: 88, reset: "1d" },
      ],
    },
    {
      caption: "Limit reached",
      windows: [
        { label: "5H", percent: 64, reset: "1h05" },
        { label: "WK", percent: 100, reset: "1d" },
      ],
    },
    { caption: "Not reported", plan: "?", windows: [{ label: "5H" }, { label: "WK" }] },
  ],
  copilot: [
    { caption: "Normal", used: "420", total: "1.5K", windows: [{ label: "MO", percent: 28, reset: "19d" }] },
    { caption: "Credits low", used: "1.3K", total: "1.5K", windows: [{ label: "MO", percent: 87, reset: "6d" }] },
    {
      caption: "Extra budget in use",
      used: "1.5K",
      total: "1.5K",
      windows: [{ label: "MO", percent: 100, reset: "6d" }],
      extra: { kind: "extra", amount: "$12/20" },
    },
    { caption: "Limit reached, no extra budget", used: "1.5K", total: "1.5K", windows: [{ label: "MO", percent: 100, reset: "6d" }] },
    { caption: "Not reported", plan: "?", windows: [{ label: "MO" }] },
  ],
  jetbrains: [
    { caption: "Normal", used: "6.1", total: "20", windows: [{ label: "MO", percent: 31, reset: "22d" }] },
    { caption: "Credits low", used: "17.4", total: "20", windows: [{ label: "MO", percent: 87, reset: "4d" }] },
    {
      caption: "Top-up credits in use",
      used: "20",
      total: "20",
      windows: [{ label: "MO", percent: 100, reset: "4d" }],
      extra: { kind: "topup", amount: "+4.2" },
    },
    { caption: "Limit reached, no top-up", used: "20", total: "20", windows: [{ label: "MO", percent: 100, reset: "4d" }] },
    { caption: "Not reported", plan: "?", windows: [{ label: "MO" }] },
  ],
};
const plans = { claude: "MAX 5×", openai: "PLUS", copilot: "PRO", jetbrains: "AI PRO" };
const rows = [
  { id: "claude", title: "CLAUDE", detail: "Claude subscription · 5-hour and weekly windows" },
  { id: "openai", title: "OPENAI", detail: "ChatGPT plan, used by Codex · 5-hour and weekly" },
  { id: "copilot", title: "GITHUB COPILOT", detail: "AI Credits · monthly · extra budget" },
  { id: "jetbrains", title: "JETBRAINS AI", detail: "AI credits · every 30 days · top-up" },
];

const width = 1300;
const scale = 1.5;
const cell = 72 * scale;
const columnX = (index) => 330 + index * 196;
const parts = [];
parts.push(text(`AI AI CAPTAIN / DESIGN PROPOSAL / ${palette.name.toUpperCase()}`, 36, 30, palette.muted, 11, 'font-weight="700" letter-spacing="2"'));
parts.push(text("Subscription budget key", 36, 68, palette.foreground, 30, 'font-weight="700"'));
parts.push(
  text(
    "Proposed, not implemented. One key for each subscription. It shows how much of the plan is used and when it resets. Drawn at 1.5× scale.",
    36,
    94,
    palette.muted,
    13,
  ),
);
parts.push(
  text(
    "Same family as the info key: canvas background, 80% mark, warning color from 80%. The border and a state band show LOW, LIMIT, and paid extras. Dashed + ?: not reported.",
    36,
    116,
    palette.foreground,
    13,
  ),
);

const headerY = 160;
["NORMAL", "LOW", "LOW OR PAID EXTRA", "LIMIT", "NOT REPORTED"].forEach((label, index) => {
  parts.push(text(label, columnX(index) + cell / 2, headerY, palette.foreground, 11, 'text-anchor="middle" font-weight="700" letter-spacing="1"'));
});
let y = 182;
for (const row of rows) {
  parts.push(text(row.title, 36, y + 44, palette.foreground, 13, 'font-weight="700" letter-spacing=".5"'));
  parts.push(text(row.detail, 36, y + 64, palette.muted, 11.5));
  examples[row.id].forEach((example, index) => {
    const data = { provider: row.id, plan: example.plan ?? plans[row.id], ...example };
    parts.push(`<g transform="translate(${columnX(index)} ${y}) scale(${scale})">${budgetKey(data)}</g>`);
    parts.push(text(example.caption, columnX(index) + cell / 2, y + cell + 18, palette.muted, 11, 'text-anchor="middle"'));
  });
  y += cell + 46;
}

// Anatomy, in the same words as the info key study.
y += 6;
parts.push(`<line x1="36" y1="${y}" x2="${width - 36}" y2="${y}" stroke="${palette.badge.border}" stroke-width="1"/>`);
y += 32;
parts.push(text("Key anatomy", 36, y, palette.foreground, 17, 'font-weight="700"'));
const anatomy = {
  provider: "claude",
  plan: "MAX 5×",
  windows: [
    { label: "5H", percent: 86, reset: "1h12" },
    { label: "WK", percent: 40, reset: "4d" },
  ],
};
parts.push(`<g transform="translate(36 ${y + 16}) scale(2.2)">${budgetKey(anatomy)}</g>`);
const notes = [
  ["Top row", "Product mark of the subscription owner, not of the harness. Plan name on the right."],
  ["Bars", "5H = 5-hour window, WK = weekly window, MO = monthly or 30-day credits. Mark at 80%."],
  ["Bar color", "Normal color below 80%. Warning color from 80%. Error color at 100%."],
  ["Bottom row", "Reset time of the window that is nearest to its limit, and its percent used."],
  ["Border", "Normal border below 80%. Warning border from 80% or when paid extras are in use."],
  ["LIMIT band", "Error band with a warning triangle. The reset time moves to the top row."],
  ["Paid extras", "Warning band EXTRA or TOP-UP. The top row shows extra spend of budget, or top-up credits left."],
  ["Not reported", "Dashed border and bars, “?” for the plan and the percent. Never a guess."],
];
notes.forEach(([term, detail], index) => {
  parts.push(text(term, 230, y + 34 + index * 22, palette.foreground, 12.5, 'font-weight="700"'));
  parts.push(text(detail, 340, y + 34 + index * 22, palette.muted, 12.5));
});

// The budget key next to the session keys and the info key of the same provider.
y += 34 + notes.length * 22 + 26;
parts.push(text("Next to session keys at 72 px", 36, y, palette.foreground, 17, 'font-weight="700"'));
const strip = [
  sessionCard("CLAUDE", "claude", "working", "WORKING", "loader-circle"),
  budgetKey({
    provider: "claude",
    plan: "MAX 5×",
    windows: [
      { label: "5H", percent: 34, reset: "2h05" },
      { label: "WK", percent: 21, reset: "4d" },
    ],
  }),
  sessionCard("CODEX", "square-code", "waiting-bright", "WAITING", "hand"),
  budgetKey({
    provider: "openai",
    plan: "PLUS",
    windows: [
      { label: "5H", percent: 82, reset: "0h35" },
      { label: "WK", percent: 60, reset: "5d" },
    ],
  }),
  sessionCard("GITHUB COPILOT", "githubcopilot", "done-bright", "DONE", "check"),
  budgetKey({ provider: "copilot", plan: "PRO", used: "1.5K", total: "1.5K", windows: [{ label: "MO", percent: 100, reset: "6d" }] }),
  sessionCard("JETBRAINS AI", "jetbrains", "working", "WORKING", "loader-circle"),
  budgetKey({
    provider: "jetbrains",
    plan: "AI PRO",
    used: "20",
    total: "20",
    windows: [{ label: "MO", percent: 100, reset: "4d" }],
    extra: { kind: "topup", amount: "+4.2" },
  }),
];
strip.forEach((art, index) => parts.push(`<g transform="translate(${36 + index * 84} ${y + 16})">${art}</g>`));

// The same key in every palette.
const paletteX = 36 + strip.length * 84 + 40;
parts.push(text("Every palette", paletteX, y, palette.foreground, 17, 'font-weight="700"'));
const original = palette;
tokens.palettes.forEach((other, index) => {
  palette = other;
  const art = budgetKey({
    provider: "claude",
    plan: "MAX 5×",
    windows: [
      { label: "5H", percent: 86, reset: "1h12" },
      { label: "WK", percent: 40, reset: "4d" },
    ],
  });
  parts.push(
    `<g transform="translate(${paletteX + index * 84} ${y + 16})"><rect x="-6" y="-6" width="84" height="84" rx="10" fill="${other.canvas}"/>${art}</g>`,
  );
  parts.push(text(other.name, paletteX + index * 84 + 36, y + 106, original.muted, 10, 'text-anchor="middle"'));
  palette = original;
});

// Data sources. Honest status for each provider.
y += 130;
parts.push(`<line x1="36" y1="${y}" x2="${width - 36}" y2="${y}" stroke="${palette.badge.border}" stroke-width="1"/>`);
y += 32;
parts.push(text("Possible data sources (none verified on this computer)", 36, y, palette.foreground, 17, 'font-weight="700"'));
const sources = [
  [
    "Claude",
    "5-hour and weekly percent used, reset times",
    "Shown by /usage in Claude Code. No documented local file. Status line or account endpoint to verify.",
  ],
  [
    "OpenAI",
    "Primary (5-hour) and secondary (weekly) percent used, resets",
    "Codex rate-limit snapshots; possibly in the rollout token_count events that the hub reads now.",
  ],
  ["GitHub Copilot", "AI Credits used of the monthly allowance, extra spend", "GitHub account usage data. Needs a GitHub token. Not in local session files."],
  ["JetBrains AI", "Credits left, reset date, top-up balance", "Shown in the JetBrains AI widget and JetBrains Account. Local source not known."],
];
sources.forEach(([name, values, where], index) => {
  const rowY = y + 30 + index * 24;
  parts.push(text(name, 36, rowY, palette.foreground, 12.5, 'font-weight="700"'));
  parts.push(text(values, 170, rowY, palette.muted, 12.5));
  parts.push(text(where, 560, rowY, palette.muted, 12.5));
});
y += 30 + sources.length * 24 + 18;
parts.push(
  text("The hub keeps only numbers, plan names, and reset times (ARCH-08). It never stores tokens for accounts in settings files.", 36, y, palette.muted, 11.5),
);
y += 22;
parts.push(
  text(
    "Brand marks: Lobe Icons 1.100.0. Interface symbols: Lucide 0.468.0. DESIGN PROPOSAL · Not implemented · Illustrated plans do not imply that usage data is available.",
    36,
    y,
    palette.muted,
    10.5,
  ),
);
const height = y + 30;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="t d">
<title id="t">AI AI Captain: subscription budget key proposal</title>
<desc id="d">Proposal. A 72 by 72 key for each AI subscription: Claude, OpenAI, GitHub Copilot, and JetBrains AI. Bars show the percent used of each limit window, with an 80 percent mark. Bands show LIMIT and paid extras. ${escapeXml(palette.name)} palette.</desc>
<metadata>${escapeXml(JSON.stringify({ purpose: "Design proposal; not implemented", generatedBy: "scripts/render-budget-key-study.mjs", previewPalette: palette.id }))}</metadata>
<rect width="${width}" height="${height}" fill="${palette.canvas}"/>
<g font-family="Arial, Helvetica, sans-serif">
${parts.join("\n")}
</g>
</svg>
`;
const name = paletteId === "fjord" ? "subscription-budget-key.svg" : `subscription-budget-key-${paletteId}.svg`;
await writeFile(join(directory, name), svg);
console.info(`Generated docs/design/${name}`);
