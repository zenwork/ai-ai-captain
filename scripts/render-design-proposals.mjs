import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  cardStates as states,
  cardIdentities as identities,
  renderBudgetCard,
  renderCard,
  renderControl,
  renderDashboardKey,
  renderHostBadge,
  renderInfoCard,
  renderInfoPlaceholder,
  renderSessionPlaceholder,
  renderSettingCard,
} from "../src/shared/card-design.ts";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const directory = join(root, "docs", "design");
const specification = JSON.parse(await readFile(join(directory, "palettes", "tokens.json"), "utf8"));
const artwork = await readFile(join(directory, "assets", "icons.svg"), "utf8");
const definitions = artwork.match(/<defs>([\s\S]*?)<\/defs>/)?.[1];
assert(definitions, "Missing local icon definitions");

const icons = Object.fromEntries(
  [...definitions.matchAll(/<symbol id="icon-([^"]+)" viewBox="([^"]+)">([\s\S]*?)<\/symbol>/g)].map((match) => [
    match[1],
    { viewBox: match[2], content: match[3] },
  ]),
);
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
${icon === "layout-dashboard" ? renderDashboardKey(palette, icons) : renderControl(icon, label, palette, icons)}
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
  return states
    .map(
      (state, index) =>
        text(state.label, 276 + index * 104, 127, palette.foreground, 10.7, 'text-anchor="middle" font-weight="700"') +
        text(state.detail, 276 + index * 104, 145, palette.muted, 10.2, 'text-anchor="middle"'),
    )
    .join("\n");
}

function fullSheet(palette) {
  const rows = identities
    .map((identity, row) => {
      const top = 176 + row * 104;
      return `<g id="row-${identity.id}">${text(identity.title, 36, top + 36, palette.foreground, 13, 'font-weight="700"')}${text(identity.detail, 36, top + 58, palette.muted)}${states.map((state, column) => tile(identity, state, palette, row + 1, 231 + column * 104, top, 1.25, "matrix")).join("\n")}</g>`;
    })
    .join("\n");
  // The sections below the matrix move down when the matrix has more rows than the original eleven.
  const shift = Math.max(0, identities.length - 11) * 104;
  const byId = (list, id) => list.find((entry) => entry.id === id);
  const examples = [
    ["copilot-cli", "working", "Copilot · CLI"],
    ["copilot-ide", "waiting-bright", "Copilot · IJ"],
    ["codex-ide", "done-bright", "Codex · new"],
    ["codex-ide", "done-aged", "Codex · aged"],
    ["codex-ide", "done-assessed", "Codex · assessed"],
    ["intellij-ai", "unknown", "JetBrains AI"],
    ["claude-app", "working", "Claude · app"],
  ];
  const samples = examples
    .map(
      ([identity, state, label], index) =>
        tile(byId(identities, identity), byId(states, state), palette, index + 1, 36 + index * 102, 1564, 1, "readability") +
        text(label, 72 + index * 102, 1655, palette.muted, 11, 'text-anchor="middle"'),
    )
    .join("\n");
  const content = `
${text(`AI AI CAPTAIN / ICON SYSTEM / ${palette.name.toUpperCase()}`, 36, 28, palette.muted, 11, 'font-weight="700" letter-spacing="2"')}
${text("One visual language. Every session.", 36, 67, palette.foreground, 31, 'font-weight="700"')}
${text(`${palette.name} reference · Full wording, Claude Desktop and assessed DONE · Live palette selectable in the dashboard.`, 36, 94, palette.muted, 13)}
${text("CLIENT / HOST", 36, 133, palette.muted, 11, 'font-weight="700" letter-spacing="1"')}
${headers(palette)}
${rows}
<g id="below-matrix" transform="translate(0 ${shift})">
<path d="M36 1335H1268" stroke="${palette.badge.border}"/>
${text("Fixed controls", 36, 1364, palette.foreground, 17, 'font-weight="700"')}
${control("layout-dashboard", "INFO", palette, 36, 1385)}${control("chevron-left", "PREV", palette, 150, 1385)}${control("chevron-right", "NEXT", palette, 264, 1385)}
${text("HOST BADGES", 411, 1399, palette.foreground, 12, 'font-weight="700" letter-spacing=".7"')}
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
${text("DESIGN REFERENCE · Assessed DONE detection remains unimplemented · Illustrated products do not imply automatic conversation telemetry.", 36, 1721, palette.muted, 10.5)}
</g>`;
  return frame(
    `AI AI Captain: ${palette.name} complete icon and state combinations`,
    `${identities.length} client/host combinations across ten state and brightness examples: STARTING, WORKING, WAITING bright/dim, DONE fresh/dim/aged/assessed, FAILED and UNK. Claude Desktop, fixed controls and seven 72-pixel samples are included. Assessed DONE is darkest and double-checked; a press on the DONE key assesses it. Choose the live palette in the dashboard.`,
    1304,
    1740 + shift,
    palette,
    content,
  );
}

const neutral = { id: "comparison", canvas: "#0B1019", foreground: "#F4F6FA", muted: "#AAB7C7" };

function assessment() {
  const completionStates = [states[4], states[6], states[7]];
  const rows = specification.palettes
    .map((palette, row) => {
      const top = 146 + row * 198;
      return `<g id="assessment-${palette.id}"><rect x="20" y="${top - 16}" width="1010" height="184" rx="12" fill="${palette.canvas}"/>
${text(palette.name, 36, top + 56, palette.foreground, 22, 'font-weight="700"')}
${text(palette.contrast === "high" ? `High contrast · ${palette.mode}` : palette.description[0], 36, top + 82, palette.muted)}
${completionStates
  .map(
    (state, column) =>
      tile(identities[4], state, palette, 5, 252 + column * 256, top, 2, `assessment-${palette.id}`) +
      text(
        column === 0 ? "Bright alert · single check" : column === 1 ? "Dark blue · single check" : "Darkest blue · double check",
        324 + column * 256,
        top + 164,
        palette.muted,
        12,
        'text-anchor="middle"',
      ),
  )
  .join("\n")}</g>`;
    })
    .join("\n");
  return frame(
    "AI AI Captain: DONE assessment in all five palettes",
    "Fresh, aged and assessed completed sessions are compared across all five palettes, including dark and light high contrast. A verified visit after completion can assess the result at any age. Assessment cancels blinking, uses the darkest blue and a double check, and resets on a new turn. It remains a design requirement, not implemented visit tracking.",
    1050,
    1274,
    neutral,
    `
${text("DONE keeps its meaning. Assessment changes attention.", 36, 48, neutral.foreground, 26, 'font-weight="700"')}
${text("All five palettes · Same session · Same scale · A press on the DONE key assesses it.", 36, 80, neutral.muted, 13)}
${text("Fresh · not assessed", 324, 118, neutral.foreground, 12, 'text-anchor="middle"')}
${text("After 10 min · not assessed", 580, 118, neutral.foreground, 12, 'text-anchor="middle"')}
${text("Visited after completion · assessed", 836, 118, neutral.foreground, 12, 'text-anchor="middle"')}
${rows}<path d="M36 1156H1014" stroke="#43546A"/>
${text("A press on the DONE key assesses a completed result immediately, at any age; there is no ten-minute prerequisite.", 36, 1186, neutral.muted, 13)}
${text("New work resets assessment. App/project activation alone cannot assess every session in that host.", 36, 1210, neutral.muted, 13)}
${text("Static design frames · Automatic visit detection is not implemented.", 36, 1244, neutral.muted, 11)}`,
  );
}

const budgetExamples = {
  claude: [
    [
      "Normal",
      {
        windows: [
          { label: "5H", percent: 34, reset: "2h05" },
          { label: "WK", percent: 21, reset: "4d" },
        ],
      },
    ],
    [
      "Session window low",
      {
        windows: [
          { label: "5H", percent: 86, reset: "1h12" },
          { label: "WK", percent: 40, reset: "4d" },
        ],
      },
    ],
    [
      "Weekly window low",
      {
        windows: [
          { label: "5H", percent: 12, reset: "4h30" },
          { label: "WK", percent: 91, reset: "2d" },
        ],
      },
    ],
    [
      "Limit reached",
      {
        windows: [
          { label: "5H", percent: 100, reset: "0h52" },
          { label: "WK", percent: 58, reset: "4d" },
        ],
      },
    ],
    ["Not reported", { plan: undefined, windows: [{ label: "5H" }, { label: "WK" }] }],
  ],
  openai: [
    [
      "Normal",
      {
        windows: [
          { label: "5H", percent: 18, reset: "3h40" },
          { label: "WK", percent: 47, reset: "5d" },
        ],
      },
    ],
    [
      "Session window low",
      {
        windows: [
          { label: "5H", percent: 82, reset: "0h35" },
          { label: "WK", percent: 60, reset: "5d" },
        ],
      },
    ],
    [
      "Bought credits in use",
      {
        windows: [
          { label: "5H", percent: 100, reset: "0h35" },
          { label: "WK", percent: 60, reset: "5d" },
        ],
        extra: { kind: "topup", amount: "106 cr" },
      },
    ],
    [
      "Limit reached",
      {
        windows: [
          { label: "5H", percent: 64, reset: "1h05" },
          { label: "WK", percent: 100, reset: "1d" },
        ],
      },
    ],
    ["Not reported", { plan: undefined, windows: [{ label: "5H" }, { label: "WK" }] }],
  ],
  copilot: [
    ["Normal", { used: "420", total: "1.5K", windows: [{ label: "MO", percent: 28, reset: "19d" }] }],
    ["Credits low", { used: "1.3K", total: "1.5K", windows: [{ label: "MO", percent: 87, reset: "6d" }] }],
    ["Extra budget in use", { used: "1.5K", total: "1.5K", windows: [{ label: "MO", percent: 100, reset: "6d" }], extra: { kind: "extra", amount: "$12/20" } }],
    ["Limit reached, no extra budget", { used: "1.5K", total: "1.5K", windows: [{ label: "MO", percent: 100, reset: "6d" }] }],
    ["Not reported", { plan: undefined, windows: [{ label: "MO" }] }],
  ],
  jetbrains: [
    ["Normal", { used: "6.1", total: "20", windows: [{ label: "MO", percent: 31, reset: "22d" }] }],
    ["Credits low", { used: "17.4", total: "20", windows: [{ label: "MO", percent: 87, reset: "4d" }] }],
    ["Top-up credits in use", { used: "20", total: "20", windows: [{ label: "MO", percent: 100, reset: "4d" }], extra: { kind: "topup", amount: "+4.2" } }],
    ["Limit reached, no top-up", { used: "20", total: "20", windows: [{ label: "MO", percent: 100, reset: "4d" }] }],
    ["Not reported", { plan: undefined, windows: [{ label: "MO" }] }],
  ],
};
const budgetRows = [
  { id: "claude", plan: "MAX 5×", title: "CLAUDE", detail: "Claude subscription · 5-hour and weekly windows" },
  { id: "openai", plan: "PLUS", title: "OPENAI", detail: "ChatGPT plan, used by Codex · 5-hour and weekly" },
  { id: "copilot", plan: "PRO", title: "GITHUB COPILOT", detail: "AI Credits · monthly · extra budget" },
  { id: "jetbrains", plan: "AI PRO", title: "JETBRAINS AI", detail: "AI credits · every 30 days · top-up" },
];

function budgetKey(data, palette) {
  return renderBudgetCard(data, palette, icons);
}

function budgetStudy(palette) {
  const width = 1300;
  const scale = 1.5;
  const cell = 72 * scale;
  const columnX = (index) => 330 + index * 196;
  const parts = [];
  parts.push(
    text(`AI AI CAPTAIN / SUBSCRIPTION BUDGET KEY / ${palette.name.toUpperCase()}`, 36, 30, palette.muted, 11, 'font-weight="700" letter-spacing="2"'),
  );
  parts.push(text("Subscription budget key", 36, 68, palette.foreground, 30, 'font-weight="700"'));
  parts.push(
    text(
      "One key for each subscription. It shows how much of the plan is used and when it resets. Drawn at 1.5× scale with the runtime renderer.",
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
  ["NORMAL", "LOW", "LOW OR PAID EXTRA", "LIMIT", "NOT REPORTED"].forEach((label, index) => {
    parts.push(text(label, columnX(index) + cell / 2, 160, palette.foreground, 11, 'text-anchor="middle" font-weight="700" letter-spacing="1"'));
  });
  let y = 182;
  for (const row of budgetRows) {
    parts.push(text(row.title, 36, y + 44, palette.foreground, 13, 'font-weight="700" letter-spacing=".5"'));
    parts.push(text(row.detail, 36, y + 64, palette.muted, 11.5));
    budgetExamples[row.id].forEach(([caption, example], index) => {
      const data = { provider: row.id, plan: row.plan, ...example };
      parts.push(`<g id="budget-${row.id}-${index}" transform="translate(${columnX(index)} ${y}) scale(${scale})">${budgetKey(data, palette)}</g>`);
      parts.push(text(caption, columnX(index) + cell / 2, y + cell + 18, palette.muted, 11, 'text-anchor="middle"'));
    });
    y += cell + 46;
  }
  y += 6;
  parts.push(`<line x1="36" y1="${y}" x2="${width - 36}" y2="${y}" stroke="${palette.badge.border}" stroke-width="1"/>`);
  y += 32;
  parts.push(text("Key anatomy", 36, y, palette.foreground, 17, 'font-weight="700"'));
  parts.push(
    `<g transform="translate(36 ${y + 16}) scale(2.2)">${budgetKey(
      {
        provider: "claude",
        plan: "MAX 5×",
        windows: [
          { label: "5H", percent: 86, reset: "1h12" },
          { label: "WK", percent: 40, reset: "4d" },
        ],
      },
      palette,
    )}</g>`,
  );
  const notes = [
    ["Top row", "Product mark of the subscription owner, not of the harness. Plan name on the right."],
    ["Bars", "5H = 5-hour window, WK = weekly window, MO = monthly or 30-day credits. Mark at 80%."],
    ["Bar color", "Normal color below 80%. Warning color from 80%. Error color at 100%."],
    ["Bottom row", "Reset time of the window that is nearest to its limit, and its percent used."],
    ["Border", "Normal border below 80%. Warning border from 80% or when paid extras are in use."],
    ["LIMIT band", "Error band with a warning triangle. The reset time moves to the top row."],
    ["Paid extras", "Warning band EXTRA or TOP-UP. The top row shows extra spend or credits left."],
    ["Not reported", "Dashed border and bars, “?” for the plan and the percent. After a reset, a window starts at 0%."],
  ];
  notes.forEach(([term, detail], index) => {
    parts.push(text(term, 230, y + 34 + index * 22, palette.foreground, 12.5, 'font-weight="700"'));
    parts.push(text(detail, 340, y + 34 + index * 22, palette.muted, 12.5));
  });
  y += 34 + notes.length * 22 + 26;
  parts.push(text("Next to session keys at 72 px", 36, y, palette.foreground, 17, 'font-weight="700"'));
  const identity = (id) => identities.find((entry) => entry.id === id);
  const state = (id) => states.find((entry) => entry.id === id);
  const strip = [
    card(identity("claude-cli"), state("working"), palette),
    budgetKey(
      {
        provider: "claude",
        plan: "MAX 5×",
        windows: [
          { label: "5H", percent: 34, reset: "2h05" },
          { label: "WK", percent: 21, reset: "4d" },
        ],
      },
      palette,
    ),
    card(identity("codex-cli"), state("waiting-bright"), palette),
    budgetKey(
      {
        provider: "openai",
        plan: "PLUS",
        windows: [
          { label: "5H", percent: 82, reset: "0h35" },
          { label: "WK", percent: 60, reset: "5d" },
        ],
      },
      palette,
    ),
    card(identity("copilot-cli"), state("done-bright"), palette),
    budgetKey({ provider: "copilot", plan: "PRO", used: "1.5K", total: "1.5K", windows: [{ label: "MO", percent: 100, reset: "6d" }] }, palette),
    card(identity("intellij-ai"), state("working"), palette),
    budgetKey(
      {
        provider: "jetbrains",
        plan: "AI PRO",
        used: "20",
        total: "20",
        windows: [{ label: "MO", percent: 100, reset: "4d" }],
        extra: { kind: "topup", amount: "+4.2" },
      },
      palette,
    ),
  ];
  strip.forEach((art, index) => parts.push(`<g transform="translate(${36 + index * 84} ${y + 16})">${art}</g>`));
  const paletteX = 36 + strip.length * 84 + 40;
  parts.push(text("Every palette", paletteX, y, palette.foreground, 17, 'font-weight="700"'));
  specification.palettes.forEach((other, index) => {
    const art = budgetKey(
      {
        provider: "claude",
        plan: "MAX 5×",
        windows: [
          { label: "5H", percent: 86, reset: "1h12" },
          { label: "WK", percent: 40, reset: "4d" },
        ],
      },
      other,
    );
    parts.push(
      `<g transform="translate(${paletteX + index * 84} ${y + 16})"><rect x="-6" y="-6" width="84" height="84" rx="10" fill="${other.canvas}"/>${art}</g>`,
    );
    parts.push(text(other.name, paletteX + index * 84 + 36, y + 106, palette.muted, 10, 'text-anchor="middle"'));
  });
  y += 130;
  parts.push(`<line x1="36" y1="${y}" x2="${width - 36}" y2="${y}" stroke="${palette.badge.border}" stroke-width="1"/>`);
  y += 32;
  parts.push(text("Data sources", 36, y, palette.foreground, 17, 'font-weight="700"'));
  const sources = [
    ["OpenAI", "Automatic", "Codex rollout token_count events: rate_limits primary, secondary, credits, plan_type."],
    ["Claude", "Reporter or API", "No verified local source yet. Report with `report budget claude` or PUT /api/budgets/claude."],
    ["GitHub Copilot", "Reporter or API", "No local source. Report with `report budget copilot` or PUT /api/budgets/copilot."],
    ["JetBrains AI", "Reporter or API", "No local source. Report with `report budget jetbrains` or PUT /api/budgets/jetbrains."],
  ];
  sources.forEach(([name, status, where], index) => {
    const rowY = y + 30 + index * 24;
    parts.push(text(name, 36, rowY, palette.foreground, 12.5, 'font-weight="700"'));
    parts.push(text(status, 170, rowY, palette.muted, 12.5));
    parts.push(text(where, 330, rowY, palette.muted, 12.5));
  });
  y += 30 + sources.length * 24 + 18;
  parts.push(
    text(
      "The hub keeps only numbers, plan names, and reset times (ARCH-08). Pressing a budget key opens the usage page of the provider.",
      36,
      y,
      palette.muted,
      11.5,
    ),
  );
  y += 22;
  parts.push(
    text(
      "Brand marks: Lobe Icons 1.100.0. Interface symbols: Lucide 0.468.0. Illustrated plans do not imply that usage data is available for every account.",
      36,
      y,
      palette.muted,
      10.5,
    ),
  );
  return frame(
    `AI AI Captain subscription budget key, ${palette.name}`,
    "A 72 by 72 key for each AI subscription: Claude, OpenAI, GitHub Copilot, and JetBrains AI. Bars show the percent used of each limit window, with an 80 percent mark. Bands show LIMIT and paid extras.",
    width,
    y + 30,
    palette,
    parts.join("\n"),
  );
}

const budgetStyleRows = [
  { style: "stripe", title: "CURRENT · STRIPE", detail: ["Brand mark and a thin top stripe.", "Same canvas and border as the info key."] },
  { style: "tint", title: "A · TINT", detail: ["A light brand wash on the whole key.", "The key reads as one brand color block."] },
  {
    style: "tab",
    title: "B · TAB",
    detail: ["A solid brand header with the mark and plan.", "Session keys have a band at the bottom;", "budget keys have one at the top."],
  },
  { style: "edge", title: "C · EDGE", detail: ["A brand bar along the left side.", "Quiet, but a new shape on the deck."] },
  { style: "tab-tint", title: "D · TAB + TINT", detail: ["The tab and the light wash together.", "The strongest separation."] },
];
const budgetStyleSamples = [
  {
    provider: "claude",
    plan: "MAX 5×",
    windows: [
      { label: "5H", percent: 34, reset: "2h05" },
      { label: "WK", percent: 21, reset: "4d" },
    ],
  },
  {
    provider: "openai",
    plan: "PLUS",
    windows: [
      { label: "5H", percent: 82, reset: "0h35" },
      { label: "WK", percent: 60, reset: "5d" },
    ],
  },
  { provider: "copilot", plan: "PRO", used: "1.5K", total: "1.5K", windows: [{ label: "MO", percent: 100, reset: "6d" }] },
  { provider: "jetbrains", plan: undefined, windows: [{ label: "MO" }] },
];

function budgetStyleStudy(palette) {
  const width = 1520;
  const scale = 1.5;
  const cell = 72 * scale;
  const keyX = (index) => 300 + index * 128;
  const deckX = 830;
  const parts = [];
  parts.push(text(`AI AI CAPTAIN / BUDGET KEY STUDY / ${palette.name.toUpperCase()}`, 36, 30, palette.muted, 11, 'font-weight="700" letter-spacing="2"'));
  parts.push(text("Make the budget keys stand out", 36, 68, palette.foreground, 30, 'font-weight="700"'));
  parts.push(
    text(
      "Proposal. Five ways to show the brand on a budget key. The levels stay the same in each: the border, the bar colors, and the LIMIT band.",
      36,
      94,
      palette.muted,
      13,
    ),
  );
  parts.push(
    text(
      "Left: budget keys at 1.5× (normal, low, limit, not reported). Right: the same key on a deck at 72 px, next to session, info, unused, and setting keys.",
      36,
      116,
      palette.foreground,
      13,
    ),
  );
  ["NORMAL", "LOW", "LIMIT", "NOT REPORTED"].forEach((label, index) =>
    parts.push(text(label, keyX(index) + cell / 2, 160, palette.foreground, 11, 'text-anchor="middle" font-weight="700" letter-spacing="1"')),
  );
  parts.push(text("ON THE DECK (72 PX)", deckX, 160, palette.foreground, 11, 'font-weight="700" letter-spacing="1"'));
  const identity = (id) => identities.find((entry) => entry.id === id);
  const state = (id) => states.find((entry) => entry.id === id);
  let y = 178;
  for (const row of budgetStyleRows) {
    parts.push(text(row.title, 36, y + 34, palette.foreground, 13, 'font-weight="700" letter-spacing=".5"'));
    row.detail.forEach((line, index) => parts.push(text(line, 36, y + 56 + index * 17, palette.muted, 11.5)));
    budgetStyleSamples.forEach((sample, index) => {
      parts.push(
        `<g id="style-${row.style}-${index}" transform="translate(${keyX(index)} ${y}) scale(${scale})">${renderBudgetCard(sample, palette, icons, row.style)}</g>`,
      );
    });
    // A deck row: a budget key between the other key types.
    const deck = [
      card(identity("claude-cli"), state("working"), palette, 1),
      renderBudgetCard(budgetStyleSamples[0], palette, icons, row.style),
      renderInfoCard({ model: "claude-opus-5-5", tokensUsed: 42_000, contextUsedPercent: 18 }, palette),
      card(identity("codex-cli"), state("done-bright"), palette, 2),
      renderBudgetCard(budgetStyleSamples[1], palette, icons, row.style),
      renderSessionPlaceholder(palette, 3),
      renderInfoPlaceholder(palette),
      renderDashboardKey(palette, icons),
    ];
    const deckY = y + (cell - 72) / 2;
    parts.push(`<rect x="${deckX - 10}" y="${deckY - 10}" width="${deck.length * 80 + 12}" height="92" rx="12" fill="${palette.badge.background}"/>`);
    deck.forEach((art, index) => parts.push(`<g transform="translate(${deckX + index * 80} ${deckY})">${art}</g>`));
    y += cell + 34;
  }
  y += 4;
  parts.push(`<line x1="36" y1="${y}" x2="${width - 36}" y2="${y}" stroke="${palette.badge.border}" stroke-width="1"/>`);
  y += 30;
  parts.push(text("Notes", 36, y, palette.foreground, 17, 'font-weight="700"'));
  const notes = [
    "All styles use only palette tokens: the brand tokens, the canvas, and the state colors. The tint is the brand color at 16% opacity.",
    "On the tab, the mark and the plan use the canvas color on the brand color. The brand tokens already meet the text contrast target against the canvas.",
    "The tint lowers the contrast of muted text a little. Check it with the contrast report before a style becomes the default.",
    "Brand color never shows a level. Claude terracotta and the warning amber stay apart because the level also has a label, a border, and a band.",
  ];
  notes.forEach((note, index) => parts.push(text(note, 36, y + 28 + index * 22, palette.muted, 12.5)));
  y += 28 + notes.length * 22 + 10;
  return frame(
    `AI AI Captain budget key study, ${palette.name}`,
    "Proposal. Five ways to make the budget keys stand out from session, info, unused, and setting keys: stripe, tint, tab, edge, and tab with tint.",
    width,
    y + 20,
    palette,
    parts.join("\n"),
  );
}

const settingStyleRows = [
  { style: "current", title: "CURRENT", detail: ["The layout of INFO, PREV, and NEXT.", "The value is small text at the top,", "or not shown."] },
  { style: "minimal", title: "A · MINIMAL", detail: ["The same layout. A switch, swatches,", "or a sun show the setting.", "The band shows the value."] },
  {
    style: "panel",
    title: "B · PANEL",
    detail: ["Control colors. The value is a switch,", "swatches, or a meter, with its value.", "A small band names the setting."],
  },
  {
    style: "value",
    title: "C · VALUE FIRST",
    detail: ["Canvas with a control outline, no band.", "The value is large in the middle.", "A new shape next to the nav keys."],
  },
];

function settingStyleStudy(palette) {
  const width = 1600;
  const scale = 1.5;
  const cell = 72 * scale;
  const keyX = (index) => 290 + index * 122;
  const deckX = 1040;
  const samples = [
    { kind: "info-keys", on: true },
    { kind: "info-keys", on: false },
    { kind: "theme", paletteName: palette.name },
    { kind: "brightness", level: 0, maximumLevel: 4 },
    { kind: "brightness", level: 2, maximumLevel: 4 },
    { kind: "brightness", level: 4, maximumLevel: 4 },
  ];
  const parts = [];
  parts.push(text(`AI AI CAPTAIN / SETTING KEY STUDY / ${palette.name.toUpperCase()}`, 36, 30, palette.muted, 11, 'font-weight="700" letter-spacing="2"'));
  parts.push(text("Redesign the setting keys", 36, 68, palette.foreground, 30, 'font-weight="700"'));
  parts.push(
    text(
      "Proposal. Toggle Info Keys, Cycle Theme, and Cycle Brightness now look like the INFO, PREV, and NEXT keys, and their value is hard to read.",
      36,
      94,
      palette.muted,
      13,
    ),
  );
  parts.push(
    text(
      "Each style shows what the key changes and its current value. Right: the keys on a deck at 72 px, next to the navigation keys.",
      36,
      116,
      palette.foreground,
      13,
    ),
  );
  ["INFO ON", "INFO OFF", "THEME", "FLASH 0", "FLASH 2", "FLASH 4"].forEach((label, index) =>
    parts.push(text(label, keyX(index) + cell / 2, 160, palette.foreground, 11, 'text-anchor="middle" font-weight="700" letter-spacing="1"')),
  );
  parts.push(text("ON THE DECK (72 PX)", deckX, 160, palette.foreground, 11, 'font-weight="700" letter-spacing="1"'));
  const identity = (id) => identities.find((entry) => entry.id === id);
  const state = (id) => states.find((entry) => entry.id === id);
  let y = 178;
  for (const row of settingStyleRows) {
    parts.push(text(row.title, 36, y + 30, palette.foreground, 13, 'font-weight="700" letter-spacing=".5"'));
    row.detail.forEach((line, index) => parts.push(text(line, 36, y + 52 + index * 17, palette.muted, 11.5)));
    samples.forEach((sample, index) =>
      parts.push(
        `<g id="setting-${row.style}-${index}" transform="translate(${keyX(index)} ${y}) scale(${scale})">${renderSettingCard(sample, palette, icons, row.style)}</g>`,
      ),
    );
    const deck = [
      card(identity("codex-cli"), state("working"), palette, 1),
      renderControl("chevron-left", "PREV", palette, icons, "1/2"),
      renderDashboardKey(palette, icons),
      renderSettingCard(samples[0], palette, icons, row.style),
      renderSettingCard(samples[2], palette, icons, row.style),
      renderSettingCard(samples[4], palette, icons, row.style),
    ];
    const deckY = y + (cell - 72) / 2;
    parts.push(`<rect x="${deckX - 10}" y="${deckY - 10}" width="${deck.length * 80 + 12}" height="92" rx="12" fill="${palette.badge.background}"/>`);
    deck.forEach((art, index) => parts.push(`<g transform="translate(${deckX + index * 80} ${deckY})">${art}</g>`));
    y += cell + 34;
  }
  y += 4;
  parts.push(`<line x1="36" y1="${y}" x2="${width - 36}" y2="${y}" stroke="${palette.badge.border}" stroke-width="1"/>`);
  y += 30;
  parts.push(text("Notes", 36, y, palette.foreground, 17, 'font-weight="700"'));
  const notes = [
    "All styles use only palette tokens: the control colors, the canvas, and the state colors of the palette for the theme swatches.",
    "The swatches show the WORKING, WAITING, DONE, and FAILED colors of the selected palette, so the key previews the palette.",
    "The meter has one bar for each level from 1 to 4. Level 0 (palette colors) fills no bar. A switch shows ON with a filled track, and OFF with an outline. A label also shows each value.",
    "Pushing a key does not change: Toggle Info Keys turns the info keys on or off, Cycle Theme selects the next palette, and Cycle Brightness selects the next level.",
  ];
  notes.forEach((note, index) => parts.push(text(note, 36, y + 28 + index * 22, palette.muted, 12.5)));
  y += 28 + notes.length * 22 + 10;
  return frame(
    `AI AI Captain setting key study, ${palette.name}`,
    "Proposal. Three redesigns of the setting keys (info keys, theme, flash intensity) compared with the current design: minimal, panel, and value first.",
    width,
    y + 20,
    palette,
    parts.join("\n"),
  );
}

function luminance(color) {
  assert.match(color, /^#[0-9a-f]{6}$/i, "Invalid color token");
  const channels = [1, 3, 5]
    .map((index) => parseInt(color.slice(index, index + 2), 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(first, second) {
  const values = [luminance(first), luminance(second)].sort((left, right) => left - right);
  return (values[1] + 0.05) / (values[0] + 0.05);
}

function validatePalette(palette) {
  assert.equal(Object.keys(palette.states).length, states.length, `${palette.id}: incomplete states`);
  const pairs = {
    captions: [
      [palette.muted, palette.canvas],
      [palette.foreground, palette.canvas],
    ],
    hostBadges: [[palette.badge.foreground, palette.badge.background], ...Object.values(palette.hosts).map((host) => [host, palette.badge.background])],
    controls: [
      [palette.controls.ink, palette.controls.accent],
      [palette.controls.foreground, palette.controls.background],
    ],
    stateLabels: states.map((state) => [palette.states[state.id].ink, palette.states[state.id].accent]),
    identityMarks: states.map((state) => [palette.states[state.id].foreground, palette.states[state.id].background]),
    brandMarks: Object.values(palette.brands).map((brand) => [brand, palette.canvas]),
  };
  const minimums = Object.fromEntries(
    Object.entries(pairs).map(([role, colors]) => [role, Math.min(...colors.map(([foreground, background]) => contrast(foreground, background)))]),
  );
  for (const [role, minimum] of Object.entries(minimums))
    assert(minimum >= palette.minimumTextContrast, `${palette.id}: ${role} contrast ${minimum.toFixed(2)} below target`);
  for (const role of ["accent", "background"]) {
    const levels = ["done-bright", "done-dim", "done-aged", "done-assessed"].map((state) => luminance(palette.states[state][role]));
    for (let index = 1; index < levels.length; index++) assert(levels[index - 1] > levels[index], `${palette.id}: DONE ${role} hierarchy`);
  }
  return {
    id: palette.id,
    name: palette.name,
    target: palette.minimumTextContrast,
    minimums: Object.fromEntries(Object.entries(minimums).map(([role, value]) => [role, Number(value.toFixed(3))])),
  };
}

function validateSvg(svg) {
  const identifiers = [...svg.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(identifiers.length, new Set(identifiers).size, "Duplicate SVG IDs");
  for (const match of svg.matchAll(/\bhref="([^"]+)"/g))
    assert(match[1].startsWith("#") && identifiers.includes(match[1].slice(1)), "Missing or external SVG reference");
  assert(!/<script|<image|<foreignObject|\son\w+=/i.test(svg), "Unexpected executable/external SVG content");
  assert(!/>RUNNING<|>RUN<|>WAIT<|>START<|>FAIL</.test(svg), "Outdated display wording");
}

assert.equal(specification.schemaVersion, 2);
assert.equal(new Set(specification.palettes.map((palette) => palette.id)).size, specification.palettes.length);
const preview = specification.palettes.find((palette) => palette.id === specification.previewPalette);
assert(preview, "Missing preview palette");
assert(
  specification.selectedPalette === null || specification.palettes.some((palette) => palette.id === specification.selectedPalette),
  "Missing selected default palette",
);
const report = {
  scope: "Text and identity contrast checks, not a claim of complete accessibility certification",
  palettes: specification.palettes.map(validatePalette),
};
const outputs = new Map([
  ["palettes/default.svg", fullSheet(preview)],
  ["done-assessment.svg", assessment()],
  ["subscription-budget-key.svg", budgetStudy(preview)],
  ["subscription-budget-key-porcelain.svg", budgetStudy(specification.palettes.find((palette) => palette.id === "porcelain"))],
  ["budget-key-styles.svg", budgetStyleStudy(preview)],
  ["budget-key-styles-porcelain.svg", budgetStyleStudy(specification.palettes.find((palette) => palette.id === "porcelain"))],
  ["setting-key-styles.svg", settingStyleStudy(preview)],
  ["setting-key-styles-porcelain.svg", settingStyleStudy(specification.palettes.find((palette) => palette.id === "porcelain"))],
  ...specification.palettes.map((palette) => [`palettes/${palette.id}.svg`, fullSheet(palette)]),
]);
const keyImageState = states.find((state) => state.id === "done-bright");
for (const identity of identities) {
  const keyImage = `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72" role="img"><title>${escapeXml(`${identity.title} ${identity.detail}`)}</title><g font-family="Arial, Helvetica, sans-serif">${card(identity, keyImageState, preview)}</g></svg>\n`;
  outputs.set(`../images/keys/${identity.id}.svg`, keyImage);
}
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
console.info(
  `${check ? "Checked" : "Generated"} ${[...outputs.keys()].filter((path) => path.endsWith(".svg")).length} SVG references, runtime assets, notices and a contrast report. High-contrast palettes meet 7:1 targets in every state and animation phase.`,
);
