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
