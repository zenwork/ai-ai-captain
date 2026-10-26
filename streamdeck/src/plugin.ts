import { action, SingletonAction, streamDeck, type KeyAction, type KeyDownEvent, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { Session } from "../../src/shared/session.js";
import { doneAttention } from "../../src/shared/attention.js";
import { defaultPaletteId, getPalette, type PaletteId } from "../../src/shared/palette.js";
import type { HubSettings } from "../../src/shared/settings.js";
import { dashboardImage, emptyImage, pagerImage, sessionImage, sessionSignature, waitingPulseIntervalMs } from "./cards.js";
import { svgDataUri } from "./images.js";
import { HubSupervisor, isHubHealthy, localHubPort, spawnHubProcess } from "./hub-supervisor.js";

type SessionSettings = Record<string, never>;
type PagerSettings = Record<string, never>;

const hubUrl = process.env.AI_AI_CAPTAIN_URL ?? "http://127.0.0.1:43681";
const dashboardResultSchema = z.object({ opened: z.boolean(), reason: z.string().optional() });
const visibleKeys = new Map<string, KeyAction<SessionSettings>>();
const renderedCards = new Map<string, string>();
const dashboardActions = new Map<string, KeyAction<SessionSettings>>();
const renderedControls = new Map<string, string>();
let palette: PaletteId = defaultPaletteId;
let sessions: Session[] = [];
const pages = new Map<string, number>();
let refreshTimer: ReturnType<typeof setInterval> | undefined;
let refreshInFlight: Promise<void> | undefined;
let pulseTimer: ReturnType<typeof setInterval> | undefined;
let waitingDimmed = false;
let doneTimer: ReturnType<typeof setTimeout> | undefined;
let doneTimerAt: number | undefined;
let rendering = false;
let renderRequested = false;
const removalConfirmationWindowMilliseconds = 10_000;
const failedFocusTimes = new Map<string, number>();
let logRenderRequested = false;

function orderedSessions(): Session[] {
  return [...sessions].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
}

function sessionKeys(deviceId: string): KeyAction<SessionSettings>[] {
  return [...visibleKeys.values()].filter((key) => key.device.id === deviceId && key.coordinates).sort((left, right) => left.coordinates!.row - right.coordinates!.row || left.coordinates!.column - right.coordinates!.column);
}

function pageSize(deviceId: string): number {
  return Math.max(1, Math.min(30, sessionKeys(deviceId).length));
}

function totalPages(deviceId: string): number {
  return Math.max(1, Math.ceil(sessions.length / pageSize(deviceId)));
}

function currentPage(deviceId: string): number {
  const page = Math.min(pages.get(deviceId) ?? 0, totalPages(deviceId) - 1);
  pages.set(deviceId, page);
  return page;
}

function sessionIndex(key: KeyAction<SessionSettings>): number | undefined {
  const slot = sessionKeys(key.device.id).findIndex((candidate) => candidate.id === key.id);
  if (slot < 0 || slot >= 30) return undefined;
  return currentPage(key.device.id) * pageSize(key.device.id) + slot;
}

function refresh(): Promise<void> {
  refreshInFlight ??= readSessions().finally(() => { refreshInFlight = undefined; });
  return refreshInFlight;
}

async function readSessions(): Promise<void> {
  try {
    const response = await fetch(`${hubUrl}/api/sessions`, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) throw new Error(`Hub returned ${response.status}`);
    const payload = await response.json() as { sessions: Session[]; settings?: HubSettings };
    sessions = payload.sessions;
    palette = getPalette(payload.settings?.palette).id;
  } catch {
    sessions = sessions.map((session) => ({ ...session, state: "unknown" }));
  }
  await renderKeys();
}

function stopRefreshWhenHidden(): void {
  if (!visibleKeys.size) {
    updatePulseTimer(false);
    updateDoneTimer();
  }
  if (visibleKeys.size || pagerActions.size || dashboardActions.size || !refreshTimer) return;
  clearInterval(refreshTimer);
  refreshTimer = undefined;
}

function updatePulseTimer(hasWaiting: boolean): void {
  if (hasWaiting && visibleKeys.size) {
    pulseTimer ??= setInterval(() => {
      waitingDimmed = !waitingDimmed;
      void renderKeys(false).catch((error: unknown) => streamDeck.logger.warn("Could not update waiting pulse", error));
    }, waitingPulseIntervalMs);
  } else if (pulseTimer) {
    clearInterval(pulseTimer);
    pulseTimer = undefined;
    waitingDimmed = false;
  }
}

function updateDoneTimer(nextChangeAt?: number): void {
  const deadline = visibleKeys.size ? nextChangeAt : undefined;
  if (deadline === doneTimerAt) return;
  if (doneTimer) clearTimeout(doneTimer);
  doneTimer = undefined;
  doneTimerAt = deadline;
  if (deadline !== undefined) {
    doneTimer = setTimeout(() => {
      doneTimer = undefined;
      doneTimerAt = undefined;
      void renderKeys(false).catch((error: unknown) => streamDeck.logger.warn("Could not update completion alert", error));
    }, Math.max(1, deadline - Date.now()));
  }
}

async function renderKeys(logUpdates = true): Promise<void> {
  renderRequested = true;
  logRenderRequested ||= logUpdates;
  if (rendering) return;
  rendering = true;
  try {
    while (renderRequested) {
      const shouldLog = logRenderRequested;
      renderRequested = false;
      logRenderRequested = false;
      await renderKeyImages(shouldLog);
    }
  } finally {
    rendering = false;
  }
}

async function renderKeyImages(logUpdates: boolean): Promise<void> {
  const ordered = orderedSessions();
  let updatedKeys = 0;
  let hasWaiting = false;
  let nextDoneAt: number | undefined;
  const options = { palette, waitingDimmed, now: Date.now() };
  for (const key of visibleKeys.values()) {
    if (!key.coordinates) continue;
    const index = sessionIndex(key);
    if (index === undefined) {
      await key.setTitle("Reserved");
      continue;
    }
    const session = ordered[index];
    if (session?.state === "waiting") hasWaiting = true;
    const completion = session && doneAttention(session, options.now);
    if (completion?.nextChangeAt !== undefined) nextDoneAt = Math.min(nextDoneAt ?? Infinity, completion.nextChangeAt);
    const keyNumber = index + 1;
    const signature = session ? sessionSignature(session, keyNumber, options) : `empty:${palette}`;
    if (renderedCards.get(key.id) !== signature) {
      await key.setImage(svgDataUri(session ? sessionImage(session, keyNumber, options) : emptyImage(palette)));
      await key.setTitle("");
      renderedCards.set(key.id, signature);
      updatedKeys++;
    }
  }
  updatePulseTimer(hasWaiting);
  updateDoneTimer(nextDoneAt);
  if (updatedKeys && logUpdates) streamDeck.logger.info(`Updated ${updatedKeys} session keys; ${ordered.length} sessions available`);
  if (logUpdates) {
    await renderPagers();
    await renderDashboards();
  }
}

async function reuseDashboard(): Promise<boolean> {
  try {
    const response = await fetch(`${hubUrl}/api/dashboard/open`, { method: "POST", signal: AbortSignal.timeout(20000) });
    if (!response.ok) return false;
    const result = dashboardResultSchema.parse(await response.json());
    if (result.reason) streamDeck.logger.warn(result.reason);
    return result.opened === true;
  } catch {
    return false;
  }
}

async function openDashboard(action: KeyAction<SessionSettings>): Promise<void> {
  if (await reuseDashboard()) return;
  try {
    await streamDeck.system.openUrl(hubUrl);
  } catch {
    streamDeck.logger.warn("Could not open the AI AI Captain dashboard");
    await action.showAlert();
  }
}

@action({ UUID: "com.local.ai-ai-captain.dashboard" })
class DashboardAction extends SingletonAction<SessionSettings> {
  async onWillAppear(event: WillAppearEvent<SessionSettings>): Promise<void> {
    if (!event.action.isKey()) return;
    dashboardActions.set(event.action.id, event.action);
    renderedControls.delete(event.action.id);
    await renderDashboards();
    if (!refreshTimer) refreshTimer = setInterval(() => void refresh(), 1500);
    await refresh();
  }

  onWillDisappear(event: WillDisappearEvent<SessionSettings>): void {
    dashboardActions.delete(event.action.id);
    renderedControls.delete(event.action.id);
    stopRefreshWhenHidden();
  }

  async onKeyDown(event: KeyDownEvent<SessionSettings>): Promise<void> {
    if (event.action.isKey()) await openDashboard(event.action);
  }
}

async function renderDashboards(): Promise<void> {
  for (const action of dashboardActions.values()) {
    const signature = `dashboard:${palette}`;
    if (renderedControls.get(action.id) === signature) continue;
    await action.setImage(svgDataUri(dashboardImage(palette)));
    await action.setTitle("");
    renderedControls.set(action.id, signature);
  }
}

async function renderPagers(): Promise<void> {
  for (const value of pagerActions.values()) {
    const deviceId = value.action.device.id;
    const page = `${currentPage(deviceId) + 1}/${totalPages(deviceId)}`;
    const signature = `${value.direction}:${page}:${palette}`;
    if (renderedControls.get(value.action.id) === signature) continue;
    await value.action.setImage(svgDataUri(pagerImage(value.direction, page, palette)));
    await value.action.setTitle("");
    renderedControls.set(value.action.id, signature);
  }
}

async function requestSessionRemoval(keyAction: KeyAction<SessionSettings>, sessionIdentifier: string): Promise<void> {
  failedFocusTimes.delete(sessionIdentifier);
  try {
    const response = await fetch(`${hubUrl}/api/sessions/${encodeURIComponent(sessionIdentifier)}`, { method: "DELETE", signal: AbortSignal.timeout(10000) });
    if (!response.ok && response.status !== 404) throw new Error(`Hub returned ${response.status}`);
    await refresh();
  } catch {
    streamDeck.logger.warn("The hub could not remove the stale session");
    await keyAction.showAlert();
  }
}

@action({ UUID: "com.local.ai-ai-captain.session" })
class SessionKey extends SingletonAction<SessionSettings> {
  async onWillAppear(event: WillAppearEvent<SessionSettings>): Promise<void> {
    if (!event.action.isKey()) return;
    visibleKeys.set(event.action.id, event.action);
    renderedCards.delete(event.action.id);
    if (!refreshTimer) refreshTimer = setInterval(() => void refresh(), 1500);
    await refresh();
  }

  onWillDisappear(event: WillDisappearEvent<SessionSettings>): void {
    visibleKeys.delete(event.action.id);
    renderedCards.delete(event.action.id);
    stopRefreshWhenHidden();
  }

  async onKeyDown(event: KeyDownEvent<SessionSettings>): Promise<void> {
    if (!event.action.isKey()) return;
    const index = sessionIndex(event.action);
    if (index === undefined) return;
    const session = orderedSessions()[index];
    if (!session) return;
    const previousFailureTime = failedFocusTimes.get(session.id);
    if (previousFailureTime !== undefined && Date.now() - previousFailureTime <= removalConfirmationWindowMilliseconds) {
      await requestSessionRemoval(event.action, session.id);
      return;
    }
    failedFocusTimes.delete(session.id);
    try {
      const response = await fetch(`${hubUrl}/api/sessions/${encodeURIComponent(session.id)}/focus`, { method: "POST", signal: AbortSignal.timeout(10000) });
      const result = await response.json() as { focused?: boolean; reason?: string };
      if (!response.ok || !result.focused) {
        streamDeck.logger.warn(result.reason ?? "The hub could not focus the session");
        failedFocusTimes.set(session.id, Date.now());
        await event.action.showAlert();
      }
    } catch {
      await event.action.showAlert();
    }
  }
}

const pagerActions = new Map<string, { direction: "previous" | "next"; action: KeyAction<PagerSettings> }>();

class PagerAction extends SingletonAction<PagerSettings> {
  constructor(private readonly direction: "previous" | "next") {
    super();
  }

  async onWillAppear(event: WillAppearEvent<PagerSettings>): Promise<void> {
    if (!event.action.isKey()) return;
    pagerActions.set(event.action.id, { direction: this.direction, action: event.action });
    renderedControls.delete(event.action.id);
    if (!refreshTimer) refreshTimer = setInterval(() => void refresh(), 1500);
    await refresh();
  }

  onWillDisappear(event: WillDisappearEvent<PagerSettings>): void {
    pagerActions.delete(event.action.id);
    renderedControls.delete(event.action.id);
    stopRefreshWhenHidden();
  }

  async onKeyDown(event: KeyDownEvent<PagerSettings>): Promise<void> {
    if (!event.action.isKey()) return;
    const deviceId = event.action.device.id;
    const count = totalPages(deviceId);
    const page = currentPage(deviceId);
    pages.set(deviceId, this.direction === "next" ? (page + 1) % count : (page + count - 1) % count);
    await renderKeys();
  }
}

@action({ UUID: "com.local.ai-ai-captain.previous-page" })
class PreviousPage extends PagerAction {
  constructor() { super("previous"); }
}

@action({ UUID: "com.local.ai-ai-captain.next-page" })
class NextPage extends PagerAction {
  constructor() { super("next"); }
}

function startHubSupervisor(): void {
  const port = localHubPort(hubUrl);
  if (port === undefined) {
    streamDeck.logger.info(`AI AI Captain plugin does not start a hub, because ${hubUrl} is not on this computer.`);
    return;
  }

  // The build puts the hub next to the plugin entry point and the dashboard files in the plugin root.
  const binaryDirectory = dirname(process.argv[1] ?? "");
  const hubEntryPath = join(binaryDirectory, "hub.cjs");
  const webRootPath = join(binaryDirectory, "..", "web");
  if (!existsSync(hubEntryPath)) {
    streamDeck.logger.warn(`AI AI Captain plugin cannot find the hub at ${hubEntryPath}. Start the hub manually.`);
    return;
  }

  const log = streamDeck.logger;
  const supervisor = new HubSupervisor({
    hubUrl,
    log,
    isHubHealthy: () => isHubHealthy(hubUrl),
    // Stream Deck runs the plugin with its own Node.js runtime. The hub uses the same runtime.
    startHubProcess: () => spawnHubProcess({ nodeExecutablePath: process.execPath, hubEntryPath, webRootPath, port, log }),
  });
  process.once("exit", () => {
    supervisor.stop();
  });
  process.once("SIGTERM", () => {
    supervisor.stop();
    process.exit(0);
  });
  supervisor.start();
}

startHubSupervisor();
streamDeck.actions.registerAction(new SessionKey());
streamDeck.actions.registerAction(new PreviousPage());
streamDeck.actions.registerAction(new NextPage());
streamDeck.actions.registerAction(new DashboardAction());
void streamDeck.connect().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
