export interface CardColors {
  background: string;
  accent: string;
  foreground: string;
  ink: string;
}

export interface CardPalette {
  id: string;
  name: string;
  mode: "dark" | "light";
  contrast: "standard" | "high";
  minimumTextContrast: number;
  description: readonly string[];
  recommendation: string;
  canvas: string;
  foreground: string;
  muted: string;
  badge: { background: string; foreground: string; border: string };
  controls: CardColors;
  states: Record<string, CardColors>;
  /** Brand colors of the subscription providers, adjusted to the contrast target of the palette. Used on budget keys only. */
  brands: { claude: string; openai: string; copilot: string; jetbrains: string };
}

export type CardIcons = Record<string, { viewBox: string; content: string }>;

export const cardStates = [
  { id: "starting", label: "STARTING", detail: "Initializing", icon: "hourglass" },
  { id: "working", label: "WORKING", detail: "Turn in progress", icon: "loader-circle" },
  { id: "waiting-bright", label: "WAITING", detail: "Pulse · bright", icon: "hand" },
  { id: "waiting-dim", label: "WAITING", detail: "Pulse · dim", icon: "hand" },
  { id: "done-bright", label: "DONE", detail: "Fresh · bright", icon: "check" },
  { id: "done-dim", label: "DONE", detail: "Recent · dim", icon: "check" },
  { id: "done-aged", label: "DONE", detail: "10+ min · unseen", icon: "check" },
  { id: "done-assessed", label: "DONE", detail: "Assessed · steady", icon: "check-check" },
  { id: "failed", label: "FAILED", detail: "Session error", icon: "triangle-alert" },
  { id: "unknown", label: "UNK", detail: "Not verified", icon: "circle-help" },
] as const;

export type CardPhase = typeof cardStates[number]["id"];

export const cardIdentities = [
  { id: "copilot-cli", title: "GITHUB COPILOT", detail: "CLI", icon: "githubcopilot", host: "terminal" },
  { id: "copilot-ide", title: "GITHUB COPILOT", detail: "IntelliJ", icon: "githubcopilot", host: "ide" },
  { id: "copilot-app", title: "MICROSOFT COPILOT", detail: "Desktop app · distinct ribbon", icon: "copilot", host: "app-window" },
  { id: "codex-cli", title: "CODEX", detail: "CLI", icon: "square-code", host: "terminal" },
  { id: "codex-ide", title: "CODEX", detail: "IntelliJ / JetBrains AI", icon: "square-code", host: "ide" },
  { id: "codex-app", title: "CODEX", detail: "Desktop app", icon: "square-code", host: "app-window" },
  { id: "intellij-ai", title: "JETBRAINS AI", detail: "Native assistant", icon: "jetbrains", host: undefined },
  { id: "claude-cli", title: "CLAUDE", detail: "CLI", icon: "claude", host: "terminal" },
  { id: "claude-ide", title: "CLAUDE", detail: "IntelliJ", icon: "claude", host: "ide" },
  { id: "claude-app", title: "CLAUDE", detail: "Desktop app", icon: "claude", host: "app-window" },
  { id: "chatgpt", title: "CHATGPT", detail: "Desktop app", icon: "openai", host: "app-window" },
  { id: "generic", title: "OTHER AGENT", detail: "Unclassified harness", icon: "bot", host: undefined },
] as const;

export function escapeXml(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);
}

function text(content: string | number, horizontal: number, vertical: number, color: string, size = 12, attributes = ""): string {
  return `<text x="${horizontal}" y="${vertical}" fill="${color}" font-size="${size}" ${attributes}>${escapeXml(content)}</text>`;
}

function icon(name: string, horizontal: number, vertical: number, width: number, height: number, icons: CardIcons, color: string): string {
  const artwork = icons[name];
  if (!artwork) throw new Error(`Missing bundled icon: ${name}`);
  const [minimumHorizontal, minimumVertical, sourceWidth, sourceHeight] = artwork.viewBox.trim().split(/\s+/).map(Number);
  if (![minimumHorizontal, minimumVertical, sourceWidth, sourceHeight].every(Number.isFinite) || sourceWidth <= 0 || sourceHeight <= 0) throw new Error(`Invalid icon viewBox: ${name}`);
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const offsetHorizontal = horizontal + (width - sourceWidth * scale) / 2 - minimumHorizontal * scale;
  const offsetVertical = vertical + (height - sourceHeight * scale) / 2 - minimumVertical * scale;
  return `<g transform="translate(${offsetHorizontal} ${offsetVertical}) scale(${scale})">${artwork.content.replaceAll("currentColor", color)}</g>`;
}

export function renderHostBadge(host: string | undefined, palette: CardPalette, icons: CardIcons, horizontal = 48, vertical = 4): string {
  if (!host) return "";
  const content = host === "ide"
    ? text("IJ", horizontal + 10, vertical + 10.8, palette.badge.foreground, 11, 'text-anchor="middle" font-weight="700"')
    : icon(host, horizontal + 3, vertical + 1, 14, 12, icons, palette.badge.foreground);
  return `<g color="${palette.badge.foreground}"><rect x="${horizontal}" y="${vertical}" width="20" height="14" rx="3" fill="${palette.badge.background}" stroke="${palette.badge.border}" stroke-width=".6"/>${content}</g>`;
}

export function renderCard(identity: typeof cardIdentities[number], state: typeof cardStates[number], palette: CardPalette, number: number | undefined, icons: CardIcons): string {
  const colors = palette.states[state.id];
  const scale = state.label.length >= 8 ? ".78" : state.label.length === 7 ? ".8" : ".94";
  const label = state.label.length > 5
    ? text(state.label, 0, 64.1, colors.ink, 11, `transform="translate(45.5 0) scale(${scale} 1)" text-anchor="middle" font-weight="800" letter-spacing=".1"`)
    : text(state.label, 44, 64.1, colors.ink, 12, 'text-anchor="middle" font-weight="800" letter-spacing=".1"');
  const mark = identity.icon === "jetbrains"
    ? `<rect x="21" y="19" width="28" height="28" rx="3" fill="${colors.foreground}"/>${text("IJ", 35, 39, colors.background, 20, 'text-anchor="middle" font-weight="800"')}${icon("sparkles", 45, 17, 13, 13, icons, colors.foreground)}`
    : icon(identity.icon, 17, 19, 38, 29, icons, colors.foreground);
  const reference = number === undefined ? "" : `<rect x="4" y="4" width="16" height="14" rx="4" fill="${palette.badge.background}"/>${text(number, 12, 14.6, palette.badge.foreground, 9.5, 'text-anchor="middle" font-weight="700"')}`;
  return `<g aria-label="${escapeXml(`${identity.title}, ${identity.detail}: ${state.label}, ${state.detail}, ${palette.name}`)}">
<rect width="72" height="72" rx="8" fill="${colors.background}"/>
<rect x="1" y="1" width="70" height="70" rx="7" fill="none" stroke="${colors.accent}" stroke-width="1.5"/>
<g color="${colors.foreground}">${mark}</g>
${renderHostBadge(identity.host, palette, icons)}
${reference}
<rect x="3" y="51" width="66" height="18" rx="4" fill="${colors.accent}"/>
<g color="${colors.ink}">${icon(state.icon, 7, 53.5, 14, 14, icons, colors.ink)}</g>
${label}
</g>`;
}

export function renderControl(symbol: string, label: string, palette: CardPalette, icons: CardIcons, page?: string): string {
  const colors = palette.controls;
  return `<rect width="72" height="72" rx="8" fill="${colors.background}" stroke="${colors.accent}" stroke-width="1.5"/>
<g color="${colors.foreground}">${icon(symbol, 18, 14, 36, 31, icons, colors.foreground)}</g>
${page ? text(page, 36, 10, colors.foreground, 8, 'text-anchor="middle" font-weight="700"') : ""}
<rect x="3" y="51" width="66" height="18" rx="4" fill="${colors.accent}"/>
${text(label, 36, 64, colors.ink, 12, 'text-anchor="middle" font-weight="800"')}`;
}

export interface InfoCardData {
  model?: string;
  tokensUsed?: number;
  contextUsedPercent?: number;
  freedom?: "limited" | "full";
  approval?: "asks" | "never";
}

// The mark sits at 80% of the bar width. At or above it, the bar uses the warning color.
export const contextWarningPercent = 80;
const infoBarLeft = 6;
const infoBarWidth = 60;
const infoBarInset = 1.5;
const infoModelMaximumLength = 8;
const thousand = 1000;
const million = 1_000_000;

export function formatTokenCount(tokens: number | undefined): string {
  if (tokens === undefined) return "—";
  if (tokens >= million) return `${(tokens / million).toFixed(1).replace(/\.0$/, "")}M`;
  if (tokens >= thousand) return `${Math.round(tokens / thousand)}K`;
  return String(tokens);
}

export function infoModelName(model: string | undefined): string {
  if (!model) return "?";
  const abbreviated = abbreviateModelName(model);
  return abbreviated.length > infoModelMaximumLength ? abbreviated.slice(0, infoModelMaximumLength) : abbreviated;
}

const modelFamilyAbbreviations: readonly (readonly [RegExp, string])[] = [
  [/^claude-/, ""],
  [/-\d{8}$/, ""],
  [/sonnet/, "son"],
  [/haiku/, "hai"],
  [/gemini/, "gem"],
  [/-?preview/, ""],
  [/(\d)-(\d)/g, "$1.$2"],
];

function abbreviateModelName(model: string): string {
  let result = model.trim().toLowerCase();
  for (const [pattern, replacement] of modelFamilyAbbreviations) result = result.replace(pattern, replacement);
  return result.replace(/^-+|-+$/g, "");
}

function infoPadlock(freedom: InfoCardData["freedom"], palette: CardPalette): string {
  const dashed = freedom === undefined ? ' stroke-dasharray="2 2"' : "";
  const color = freedom === "full" ? palette.states.working.accent : freedom === "limited" ? palette.states["waiting-bright"].accent : palette.muted;
  const shackle = freedom === "full" ? "M2,6 V4 a4,4 0 0 1 8,0" : "M2,6 V4 a4,4 0 0 1 8,0 V6";
  const body = freedom === undefined
    ? `<rect x="0" y="6" width="12" height="9" rx="2" fill="none" stroke="${color}" stroke-width="1.5"${dashed}/>`
    : `<rect x="0" y="6" width="12" height="9" rx="2" fill="${color}" stroke="${color}" stroke-width="1.5"/>`;
  return `<g transform="translate(44 44) scale(1.4)"><path d="${shackle}" fill="none" stroke="${color}" stroke-width="1.8"${dashed}/>${body}</g>`;
}

function infoAutoSymbol(approval: InfoCardData["approval"], freedomKnown: boolean, palette: CardPalette): string {
  if (approval === "asks") return "";
  const unknown = approval === undefined;
  // A host that reports no mode at all shows one dashed padlock. Do not add a second unknown symbol.
  if (unknown && !freedomKnown) return "";
  const color = unknown ? palette.muted : palette.states.working.accent;
  const style = unknown ? ' stroke-width="1.8" stroke-dasharray="2 2"' : ' stroke-width="2.2"';
  return `<g transform="translate(8 45) scale(1.4)"><path d="M1,1 L6,7.5 L1,14 M7,1 L12,7.5 L7,14" fill="none" stroke="${color}"${style} stroke-linecap="round" stroke-linejoin="round"/></g>`;
}

export function describeInfoCard(data: InfoCardData): string {
  const context = data.contextUsedPercent === undefined ? "context not reported" : `context ${Math.round(data.contextUsedPercent)} percent`;
  const freedom = data.freedom === "full" ? "full freedom" : data.freedom === "limited" ? "limited freedom" : "freedom not reported";
  const approval = data.approval === "never" ? "never asks" : data.approval === "asks" ? "asks for decisions" : "approval not reported";
  return `${data.model ?? "model not reported"}, ${formatTokenCount(data.tokensUsed)} tokens, ${context}, ${freedom}, ${approval}`;
}

export function renderInfoCard(data: InfoCardData, palette: CardPalette): string {
  const percent = data.contextUsedPercent;
  const reported = percent !== undefined;
  const barColor = reported && percent >= contextWarningPercent ? palette.states["waiting-bright"].accent : palette.states.working.accent;
  const fillWidth = reported ? Math.round((infoBarWidth - 2 * infoBarInset) * percent) / 100 : 0;
  const markHorizontal = infoBarLeft + (infoBarWidth * contextWarningPercent) / 100 - infoBarInset;
  const outline = `<rect x="${infoBarLeft}" y="22" width="${infoBarWidth}" height="18" rx="4" fill="none" stroke="${palette.badge.border}" stroke-width="1.5"${reported ? "" : ' stroke-dasharray="3 3"'}/>`;
  const fill = reported ? `<rect x="${infoBarLeft + infoBarInset}" y="23.5" width="${fillWidth}" height="15" rx="3" fill="${barColor}"/>` : "";
  const tokenColor = data.tokensUsed === undefined ? palette.muted : palette.foreground;
  return `<g aria-label="${escapeXml(describeInfoCard(data))}">
<rect width="72" height="72" rx="8" fill="${palette.canvas}" stroke="${palette.badge.border}" stroke-width="1.5"/>
${text(infoModelName(data.model), 6, 15, palette.muted, 10)}
${text(formatTokenCount(data.tokensUsed), 66, 15, tokenColor, 10, 'text-anchor="end"')}
${outline}${fill}
<line x1="${markHorizontal}" y1="21" x2="${markHorizontal}" y2="41" stroke="${palette.muted}" stroke-width="1"/>
${infoAutoSymbol(data.approval, data.freedom !== undefined, palette)}${infoPadlock(data.freedom, palette)}
</g>`;
}

export const budgetProviders = [
  { id: "claude", title: "CLAUDE", icon: "claude", usageUrl: "https://claude.ai/settings/usage" },
  { id: "openai", title: "OPENAI", icon: "openai", usageUrl: "https://chatgpt.com/codex/settings/usage" },
  { id: "copilot", title: "GITHUB COPILOT", icon: "githubcopilot", usageUrl: "https://github.com/settings/billing" },
  { id: "jetbrains", title: "JETBRAINS AI", icon: "jetbrains", usageUrl: "https://account.jetbrains.com/licenses" },
] as const;
export type BudgetProviderId = typeof budgetProviders[number]["id"];

export interface BudgetWindowCard {
  /** 5H, WK, or MO. */
  label: string;
  /** Percent used, 0 to 100. Undefined when not reported. */
  percent?: number;
  /** Short time until the reset, for example "1h12" or "4d". */
  reset?: string;
}

export interface BudgetCardData {
  provider: BudgetProviderId;
  plan?: string;
  /** Two windows (5H and WK) or one window (MO). */
  windows: readonly BudgetWindowCard[];
  /** Credits used and the allowance, already formatted. Only for one-window keys. */
  used?: string;
  total?: string;
  /** Paid extras in use: extra spend (Copilot) or top-up credits (JetBrains AI). */
  extra?: { kind: "extra" | "topup"; amount: string };
}

// The same 80% mark and warning rule as the context bar of the info key.
type BudgetLevel = "ok" | "low" | "out" | "unknown";

function budgetLevel(percent: number | undefined): BudgetLevel {
  if (percent === undefined) return "unknown";
  if (percent >= 100) return "out";
  if (percent >= contextWarningPercent) return "low";
  return "ok";
}

// The product mark in the brand color, and a brand stripe along the top edge. Brand color never shows a level:
// the bars, the border, and the bands keep the state colors.
/**
 * How a budget key shows its brand, so that it stands out from session and info keys (design study, docs/design).
 * The default is "tab". The other styles stay for the design study.
 * - stripe: brand mark and a thin brand stripe at the top (the first design).
 * - tint: the stripe, and a light brand wash on the whole key.
 * - tab: a solid brand header with the mark and the plan in the canvas color.
 * - edge: the stripe, and a brand bar along the left side.
 * - tab-tint: the tab, and the light brand wash.
 */
export const budgetStyles = ["stripe", "tint", "tab", "edge", "tab-tint"] as const;
export type BudgetStyle = (typeof budgetStyles)[number];
const budgetTintOpacity = ".16";

function budgetMark(provider: typeof budgetProviders[number], palette: CardPalette, icons: CardIcons, style: BudgetStyle): string {
  const brand = palette.brands[provider.id];
  const tab = style === "tab" || style === "tab-tint";
  // On the tab, the mark uses the canvas color on the brand color. Both meet the contrast target of the palette.
  const ink = tab ? palette.canvas : brand;
  const decoration = tab
    ? `<path d="M0,8 a8,8 0 0 1 8,-8 h56 a8,8 0 0 1 8,8 v12 h-72 z" fill="${brand}"/>`
    : `<rect x="23" y="3.4" width="42" height="2.2" rx="1.1" fill="${brand}"/>${style === "edge" ? `<rect x="1.8" y="9" width="2.6" height="54" rx="1.3" fill="${brand}"/>` : ""}`;
  if (provider.icon === "jetbrains") {
    return `${decoration}<rect x="6" y="5" width="12" height="12" rx="2" fill="${ink}"/>${text("IJ", 12, 14.4, tab ? brand : palette.canvas, 8, 'text-anchor="middle" font-weight="800"')}${icon("sparkles", 15.5, 2.5, 6, 6, icons, ink)}`;
  }
  return `${decoration}<g color="${ink}">${icon(provider.icon, 5, tab ? 3 : 5, 14, 14, icons, ink)}</g>`;
}

function budgetBar(window: BudgetWindowCard, vertical: number, palette: CardPalette): string {
  const left = 21;
  const width = 45;
  const level = budgetLevel(window.percent);
  const color = level === "out" ? palette.states.failed.accent : level === "low" ? palette.states["waiting-bright"].accent : palette.states.working.accent;
  // A small use stays visible: any use above 0% fills at least 2 pixels.
  const percent = window.percent === undefined ? 0 : Math.min(Math.max(window.percent, 0), 100);
  const fillWidth = percent > 0 ? Math.max(2, Math.round((width - 3) * percent) / 100) : 0;
  const fill = fillWidth ? `<rect x="${left + 1.5}" y="${vertical + 1.5}" width="${fillWidth}" height="7" rx="${Math.min(2, fillWidth / 2)}" fill="${color}"/>` : "";
  const mark = left + (width * contextWarningPercent) / 100 - 1.5;
  return `${text(window.label, 6, vertical + 8.4, palette.muted, 8.5, 'font-weight="700"')}
<rect x="${left}" y="${vertical}" width="${width}" height="10" rx="3" fill="none" stroke="${palette.badge.border}" stroke-width="1.2"${window.percent === undefined ? ' stroke-dasharray="2.5 2.5"' : ""}/>${fill}
<line x1="${mark}" y1="${vertical - 1}" x2="${mark}" y2="${vertical + 11}" stroke="${palette.muted}" stroke-width="1"/>`;
}

// A state band like the band of a session key: symbol on the left, label in the middle.
function budgetBand(label: string, colors: CardColors, symbol: string, icons: CardIcons): string {
  const content = label.length > 5
    ? text(label, 0, 64.1, colors.ink, 11, `transform="translate(45.5 0) scale(${label.length >= 7 ? ".78" : ".86"} 1)" text-anchor="middle" font-weight="800" letter-spacing=".1"`)
    : text(label, 44, 64.1, colors.ink, 12, 'text-anchor="middle" font-weight="800" letter-spacing=".1"');
  return `<rect x="3" y="51" width="66" height="18" rx="4" fill="${colors.accent}"/>
<g color="${colors.ink}">${icon(symbol, 7, 53.5, 14, 14, icons, colors.ink)}</g>
${content}`;
}

// A value in the top row. The symbol before it moves with the length of the value.
function budgetTopValue(value: string, color: string, icons: CardIcons, symbol?: string): string {
  const width = value.length * 6.1;
  return `${symbol ? icon(symbol, 66 - width - 13, 6, 10, 10, icons, color) : ""}${text(value, 66, 15, color, 10, 'text-anchor="end" font-weight="700"')}`;
}

export function describeBudgetCard(data: BudgetCardData): string {
  const provider = budgetProviders.find((entry) => entry.id === data.provider)!;
  const windows = data.windows.map((window) => `${window.label} ${window.percent === undefined ? "not reported" : `${Math.round(window.percent)} percent used`}${window.reset ? `, resets in ${window.reset}` : ""}`);
  const extra = data.extra ? `; ${data.extra.kind === "topup" ? "top-up credits in use" : "extra budget in use"}, ${data.extra.amount}` : "";
  return `${provider.title} ${data.plan ?? "plan not reported"} budget: ${windows.join("; ")}${extra}`;
}

/** The subscription budget key. It uses the canvas background like the info key. The border shows the worst level. */
export function renderBudgetCard(data: BudgetCardData, palette: CardPalette, icons: CardIcons, style: BudgetStyle = "tab"): string {
  const provider = budgetProviders.find((entry) => entry.id === data.provider)!;
  const percents = data.windows.map((window) => window.percent).filter((value): value is number => value !== undefined);
  const worst = percents.length ? Math.max(...percents) : undefined;
  const binding = data.windows.find((window) => window.percent === worst);
  const level = budgetLevel(worst);
  const extra = data.extra;
  const out = level === "out" && !extra;
  const warning = palette.states["waiting-bright"];
  const border = out ? palette.states.failed.accent : level === "low" || extra ? warning.accent : palette.badge.border;
  const brand = palette.brands[provider.id];
  const tab = style === "tab" || style === "tab-tint";
  const tinted = style === "tint" || style === "tab-tint";
  const parts = [
    `<rect width="72" height="72" rx="8" fill="${palette.canvas}"/>`,
    tinted ? `<rect width="72" height="72" rx="8" fill="${brand}" opacity="${budgetTintOpacity}"/>` : "",
    budgetMark(provider, palette, icons, style),
    `<rect x="1" y="1" width="70" height="70" rx="7" fill="none" stroke="${border}" stroke-width="1.5"${level === "unknown" ? ' stroke-dasharray="3 3"' : ""}/>`,
  ];
  // Top right: the plan. When the budget is out, the reset time takes its place. Paid extras show their amount.
  // On the tab, the top row uses the canvas color on the brand color.
  if (out) parts.push(budgetTopValue(binding?.reset ?? "?", tab ? palette.canvas : palette.foreground, icons, "rotate-ccw"));
  else if (extra) parts.push(budgetTopValue(extra.amount, tab ? palette.canvas : warning.accent, icons));
  else parts.push(text(data.plan ?? "?", 66, 15, tab ? palette.canvas : palette.muted, 9.5, 'text-anchor="end" font-weight="700"'));
  if (data.windows.length === 1) {
    const used = data.used ?? "?";
    parts.push(text(used, 6, 32, data.used === undefined ? palette.muted : palette.foreground, 13, 'font-weight="700"'));
    parts.push(text(`/ ${data.total ?? "?"}`, used.length * 7.6 + 9, 32, palette.muted, 9));
    parts.push(budgetBar(data.windows[0], 37, palette));
  } else {
    parts.push(budgetBar(data.windows[0] ?? { label: "5H" }, 22, palette));
    parts.push(budgetBar(data.windows[1] ?? { label: "WK" }, 37, palette));
  }
  if (extra) parts.push(budgetBand(extra.kind === "topup" ? "TOP-UP" : "EXTRA", warning, extra.kind === "topup" ? "sparkles" : "triangle-alert", icons));
  else if (out) parts.push(budgetBand("LIMIT", palette.states.failed, "triangle-alert", icons));
  else if (level === "unknown") parts.push(text("—", 6, 64, palette.muted, 11), text("?", 66, 64, palette.muted, 12, 'text-anchor="end" font-weight="800"'));
  else {
    parts.push(`<g color="${palette.muted}">${icon("rotate-ccw", 6, 55.5, 9, 9, icons, palette.muted)}</g>`, text(binding?.reset ?? "?", 17.5, 63.5, palette.foreground, 9.5));
    parts.push(text(`${Math.round(worst!)}%`, 66, 64, level === "low" ? warning.accent : palette.foreground, 11.5, 'text-anchor="end" font-weight="800"'));
  }
  return `<g aria-label="${escapeXml(describeBudgetCard(data))}">${parts.join("\n")}</g>`;
}

// Unused keys stay in the background: faint dashed outlines in the badge border color, and small muted text.
const placeholderOpacity = ".45";

/**
 * An unused session key: a faint dashed outline and the small key number.
 * It shows the place of the key on the deck and in the Stream Deck app, without a state.
 */
export function renderSessionPlaceholder(palette: CardPalette, number?: number): string {
  const label = number === undefined ? "" : text(number, 36, 40.5, palette.muted, 12, `text-anchor="middle" font-weight="700" opacity="${placeholderOpacity}"`);
  return `<g aria-label="${escapeXml(`Unused session key${number === undefined ? "" : ` ${number}`}`)}">
<rect width="72" height="72" rx="8" fill="${palette.canvas}"/>
<rect x="2" y="2" width="68" height="68" rx="7" fill="none" stroke="${palette.badge.border}" stroke-width="1.2" stroke-dasharray="3 4" opacity="${placeholderOpacity}"/>
${label}
</g>`;
}

/** An unused info key: a faint dashed outline, the outline of the context bar, and a small INFO label. */
export function renderInfoPlaceholder(palette: CardPalette): string {
  return `<g aria-label="Unused info key">
<rect width="72" height="72" rx="8" fill="${palette.canvas}"/>
<rect x="2" y="2" width="68" height="68" rx="7" fill="none" stroke="${palette.badge.border}" stroke-width="1.2" stroke-dasharray="3 4" opacity="${placeholderOpacity}"/>
<rect x="${infoBarLeft + 4}" y="28" width="${infoBarWidth - 8}" height="12" rx="3" fill="none" stroke="${palette.badge.border}" stroke-width="1.2" stroke-dasharray="3 3" opacity="${placeholderOpacity}"/>
${text("INFO", 36, 58, palette.muted, 8, `text-anchor="middle" font-weight="700" letter-spacing=".5" opacity="${placeholderOpacity}"`)}
</g>`;
}

/** Monochrome symbols for the action list of the Stream Deck app. Each symbol is drawn in a 20 × 20 box. */
export const actionIconSymbols = {
  session: "session-key",
  "session-info": "info-key",
  "previous-page": "chevron-left",
  "next-page": "chevron-right",
  dashboard: "layout-dashboard",
  "toggle-info-keys": "square-code",
  "cycle-theme": "app-window",
  "cycle-brightness": "sparkles",
  "budget-claude": "claude",
  "budget-openai": "openai",
  "budget-copilot": "githubcopilot",
  "budget-jetbrains": "jetbrains",
} as const;
export type ActionIconId = keyof typeof actionIconSymbols;

export function renderActionIcon(id: ActionIconId, icons: CardIcons, color = "#FFFFFF"): string {
  const symbol = actionIconSymbols[id];
  let content: string;
  if (symbol === "session-key") {
    content = `<rect x="2.5" y="2.5" width="15" height="15" rx="3" fill="none" stroke="${color}" stroke-width="1.6"/><rect x="4.5" y="12" width="11" height="3.5" rx="1" fill="${color}"/>`;
  } else if (symbol === "info-key") {
    content = `<rect x="2" y="7" width="16" height="6" rx="1.8" fill="none" stroke="${color}" stroke-width="1.5"/><rect x="3.6" y="8.6" width="8" height="2.8" rx=".8" fill="${color}"/><path d="M14.5 5.5v9" stroke="${color}" stroke-width="1.2"/><path d="M3 3.5h5M12 3.5h5M3 16.5h4" stroke="${color}" stroke-width="1.4" stroke-linecap="round"/>`;
  } else if (symbol === "jetbrains") {
    content = `<rect x="2" y="3" width="13" height="13" rx="2" fill="${color}"/>${text("IJ", 8.5, 13.2, "#000000", 8, 'text-anchor="middle" font-weight="800"')}${icon("sparkles", 13, 0.5, 7, 7, icons, color)}`;
  } else {
    content = icon(symbol, 2, 2, 16, 16, icons, color);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><g font-family="Arial, Helvetica, sans-serif">${content}</g></svg>\n`;
}

/**
 * The three setting keys: info keys on or off, the palette, and the flash intensity.
 * Design study (docs/design/setting-key-styles.svg). The default is "value". The other styles stay for the study.
 * - current: the control layout of INFO, PREV, and NEXT, with a caption at the top.
 * - minimal: the same layout, with a symbol for the setting and the value in the band.
 * - panel: the control colors, with the value drawn as a switch, swatches, or a meter, and the name in a small band.
 * - value: the canvas color with a control outline and no band. The value is large in the middle.
 */
export const settingStyles = ["current", "minimal", "panel", "value"] as const;
export type SettingStyle = (typeof settingStyles)[number];

export interface SettingCardData {
  kind: "info-keys" | "theme" | "brightness";
  on?: boolean;
  paletteName?: string;
  level?: number;
  maximumLevel?: number;
}

// A switch: a rounded track with a knob. On: filled track, knob on the right. Off: outline track, knob on the left.
function settingSwitch(on: boolean, x: number, y: number, width: number, height: number, accent: string, background: string, muted: string): string {
  const radius = height / 2;
  const knob = on ? x + width - radius : x + radius;
  return on
    ? `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${accent}"/><circle cx="${knob}" cy="${y + radius}" r="${radius - 2.5}" fill="${background}"/>`
    : `<rect x="${x + .75}" y="${y + .75}" width="${width - 1.5}" height="${height - 1.5}" rx="${radius - .75}" fill="none" stroke="${muted}" stroke-width="1.5"/><circle cx="${knob}" cy="${y + radius}" r="${radius - 3.5}" fill="${muted}"/>`;
}

// Swatches of the selected palette: the WORKING, WAITING, DONE, and FAILED colors.
function settingSwatches(palette: CardPalette, centerX: number, y: number, radius: number, outline: string): string {
  const colors = ["working", "waiting-bright", "done-bright", "failed"].map((state) => palette.states[state].accent);
  const gap = radius * 2 + 3;
  const start = centerX - (gap * (colors.length - 1)) / 2;
  return colors.map((color, index) => `<circle cx="${start + index * gap}" cy="${y}" r="${radius}" fill="${color}" stroke="${outline}" stroke-width="1"/>`).join("");
}

// A meter of rising bars, one bar for each level above 0. Level 0 fills no bar.
function settingMeter(level: number, maximum: number, x: number, bottom: number, width: number, height: number, accent: string, muted: string): string {
  const count = maximum;
  const gap = 2.5;
  const barWidth = (width - gap * (count - 1)) / count;
  return Array.from({ length: count }, (_unused, index) => {
    const barHeight = height * (0.35 + (0.65 * index) / Math.max(1, count - 1));
    const left = x + index * (barWidth + gap);
    const top = bottom - barHeight;
    return index < level
      ? `<rect x="${left}" y="${top}" width="${barWidth}" height="${barHeight}" rx="1.5" fill="${accent}"/>`
      : `<rect x="${left + .6}" y="${top + .6}" width="${barWidth - 1.2}" height="${barHeight - 1.2}" rx="1.2" fill="none" stroke="${muted}" stroke-width="1.2"/>`;
  }).join("");
}

// A sun for the flash intensity: a circle with eight rays.
function settingSun(centerX: number, centerY: number, radius: number, color: string): string {
  const rays = Array.from({ length: 8 }, (_unused, index) => {
    const angle = (Math.PI / 4) * index;
    const inner = radius + 3;
    const outer = radius + 7;
    return `<line x1="${(centerX + Math.cos(angle) * inner).toFixed(2)}" y1="${(centerY + Math.sin(angle) * inner).toFixed(2)}" x2="${(centerX + Math.cos(angle) * outer).toFixed(2)}" y2="${(centerY + Math.sin(angle) * outer).toFixed(2)}" stroke="${color}" stroke-width="2.4" stroke-linecap="round"/>`;
  }).join("");
  return `<circle cx="${centerX}" cy="${centerY}" r="${radius}" fill="none" stroke="${color}" stroke-width="2.4"/>${rays}`;
}

export function describeSettingCard(data: SettingCardData): string {
  if (data.kind === "info-keys") return `Info keys ${data.on ? "on" : "off"}`;
  if (data.kind === "theme") return `Palette ${data.paletteName ?? ""}`.trim();
  return `Flash intensity ${data.level ?? 0} of ${data.maximumLevel ?? 4}`;
}

export function renderSettingCard(data: SettingCardData, palette: CardPalette, icons: CardIcons, style: SettingStyle = "value"): string {
  const colors = palette.controls;
  const level = data.level ?? 0;
  const maximum = data.maximumLevel ?? 4;
  const name = data.kind === "info-keys" ? "INFO KEYS" : data.kind === "theme" ? "THEME" : "FLASH";
  const value = data.kind === "info-keys" ? (data.on ? "ON" : "OFF") : data.kind === "theme" ? (data.paletteName ?? "?") : `${level}/${maximum}`;
  const label = (content: string, y: number, color: string, size: number) => {
    const scaled = content.length > 7 ? ` transform="translate(36 0) scale(${Math.max(.62, 7 / content.length).toFixed(2)} 1)"` : "";
    return text(content, scaled ? 0 : 36, y, color, size, `text-anchor="middle" font-weight="800"${scaled}`);
  };
  let content: string;
  if (style === "current") {
    const symbol = data.kind === "info-keys" ? "square-code" : data.kind === "theme" ? "app-window" : "sparkles";
    const band = data.kind === "info-keys" ? value : data.kind === "theme" ? "THEME" : "LEVEL";
    const caption = data.kind === "info-keys" ? "INFO" : data.kind === "theme" ? (data.paletteName ?? "") : `BRIGHT ${level}/${maximum}`;
    content = renderControl(symbol, band, palette, icons, caption);
  } else if (style === "minimal") {
    const symbol = data.kind === "info-keys"
      ? settingSwitch(data.on === true, 20, 20, 32, 17, colors.foreground, colors.background, colors.foreground)
      : data.kind === "theme" ? settingSwatches(palette, 36, 28.5, 6, colors.background) : settingSun(36, 28, 7, colors.foreground);
    content = `<rect width="72" height="72" rx="8" fill="${colors.background}" stroke="${colors.accent}" stroke-width="1.5"/>
${text(name, 36, 11, colors.foreground, 7.5, 'text-anchor="middle" font-weight="700" letter-spacing=".5"')}
${symbol}
<rect x="3" y="51" width="66" height="18" rx="4" fill="${colors.accent}"/>
${label(value, 64, colors.ink, 12)}`;
  } else if (style === "panel") {
    const visual = data.kind === "info-keys"
      ? settingSwitch(data.on === true, 16, 13, 40, 21, colors.accent, colors.background, colors.foreground)
      : data.kind === "theme" ? settingSwatches(palette, 36, 22, 6.5, colors.background) : settingMeter(level, maximum, 17, 33, 38, 22, colors.accent, colors.foreground);
    content = `<rect width="72" height="72" rx="8" fill="${colors.background}" stroke="${colors.accent}" stroke-width="1.5"/>
${visual}
${label(value, 48, colors.foreground, 12)}
<rect x="3" y="56" width="66" height="13" rx="3.5" fill="${colors.accent}"/>
${text(name, 36, 65.6, colors.ink, 8, 'text-anchor="middle" font-weight="800" letter-spacing=".5"')}`;
  } else {
    const visual = data.kind === "info-keys"
      ? settingSwitch(data.on === true, 14, 22, 44, 23, colors.accent, palette.canvas, palette.muted)
      : data.kind === "theme" ? settingSwatches(palette, 36, 33, 6.5, palette.canvas) : settingMeter(level, maximum, 15, 44, 42, 26, colors.accent, palette.muted);
    content = `<rect width="72" height="72" rx="8" fill="${palette.canvas}"/>
<rect x="1" y="1" width="70" height="70" rx="7" fill="none" stroke="${colors.accent}" stroke-width="1.5"/>
${text(name, 36, 13, palette.muted, 8, 'text-anchor="middle" font-weight="700" letter-spacing=".8"')}
${visual}
${label(value, 63, palette.foreground, 12)}`;
  }
  return `<g aria-label="${escapeXml(describeSettingCard(data))}">${content}</g>`;
}

/**
 * The INFO key that opens the dashboard. It has the same frame as the setting keys: the canvas color with a
 * control-accent outline and no band. The word DASHBOARD is small at the top, the symbol is in the middle,
 * and INFO is large at the bottom.
 */
export function renderDashboardKey(palette: CardPalette, icons: CardIcons): string {
  const colors = palette.controls;
  return `<g aria-label="Open the dashboard"><rect width="72" height="72" rx="8" fill="${palette.canvas}"/>
<rect x="1" y="1" width="70" height="70" rx="7" fill="none" stroke="${colors.accent}" stroke-width="1.5"/>
${text("DASHBOARD", 36, 13, palette.muted, 8, 'text-anchor="middle" font-weight="700" letter-spacing=".8"')}
<g color="${colors.accent}">${icon("layout-dashboard", 23, 20, 26, 26, icons, colors.accent)}</g>
${text("INFO", 36, 63, palette.foreground, 12, 'text-anchor="middle" font-weight="800"')}</g>`;
}

/**
 * The Stream Deck key frame covers a thin edge of the key display, and the display can sit a little off center.
 * A full-size key image then looks too big or shifted. Draw each key at 94% size in the center of the image,
 * so that the frame never touches the key outline. The margin is transparent and shows as black on the device.
 */
export const keySafeScale = 0.94;

export function inKeySafeArea(content: string): string {
  const offset = (72 * (1 - keySafeScale)) / 2;
  return `<g transform="translate(${offset.toFixed(2)} ${offset.toFixed(2)}) scale(${keySafeScale})">${content}</g>`;
}
