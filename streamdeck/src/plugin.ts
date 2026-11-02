import { action, SingletonAction, streamDeck, type KeyAction, type KeyDownEvent, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { dismissableStates, type Client, type Session } from "../../src/shared/session.js";
import type { Budget } from "../../src/shared/budget.js";
import { budgetProviders, type BudgetProviderId } from "../../src/shared/card-design.js";
import { doneAttention } from "../../src/shared/attention.js";
import { defaultPaletteId, getPalette, paletteIds, type PaletteId } from "../../src/shared/palette.js";
import { defaultFlashIntensity, defaultShowInfoKeys, flashIntensityMax, flashIntensityMin, type HubSettings } from "../../src/shared/settings.js";
import { isFlashIntensity } from "../../src/shared/flash-intensity.js";
import {
  appImage,
  appSignature,
  budgetImage,
  budgetSignature,
  dashboardImage,
  infoImage,
  infoPlaceholderImage,
  infoSignature,
  pagerImage,
  sessionImage,
  sessionPlaceholderImage,
  sessionSignature,
  settingControlImage,
  settingControlSignature,
  waitingPulseIntervalMs,
  type SettingControlKind,
} from "./cards.js";
import { svgDataUri } from "./images.js";
import { HubSupervisor, isHubHealthy, localHubPort, spawnHubProcess } from "./hub-supervisor.js";

type SessionSettings = Record<string, never>;
type PagerSettings = Record<string, never>;

const hubUrl = process.env.AI_AI_CAPTAIN_URL ?? "http://127.0.0.1:43681";
const dashboardResultSchema = z.object({ opened: z.boolean(), reason: z.string().optional() });
const visibleKeys = new Map<string, KeyAction<SessionSettings>>();
const renderedCards = new Map<string, string>();
const dashboardActions = new Map<string, KeyAction<SessionSettings>>();
const infoKeys = new Map<string, KeyAction<SessionSettings>>();
const renderedControls = new Map<string, string>();
let palette: PaletteId = defaultPaletteId;
let flashIntensity = defaultFlashIntensity;
let showInfoKeys = defaultShowInfoKeys;
let sessions: Session[] = [];
let clients: Client[] = [];
let budgets: Budget[] = [];
const budgetActions = new Map<string, { provider: BudgetProviderId; action: KeyAction<SessionSettings> }>();
// After a start or a reload of the plugin, ask the hub once to read the budget sources again.
let budgetRefreshRequested = false;
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

// A second press on the same DONE, FAILED, or UNKNOWN session key within this time dismisses the session.
const doublePressWindowMilliseconds = 400;
const pendingPresses = new Map<string, { sessionId: string; timer: ReturnType<typeof setTimeout> }>();

function visibleSessions(): Session[] {
  return sessions.filter((session) => !session.dismissedAt);
}

function orderedSessions(): Session[] {
  return [...visibleSessions()].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
}

function orderedClients(): Client[] {
  return [...clients].sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}

function keyItemCount(): number {
  return visibleSessions().length + clients.length;
}

function sessionKeys(deviceId: string): KeyAction<SessionSettings>[] {
  return [...visibleKeys.values()]
    .filter((key) => key.device.id === deviceId && key.coordinates)
    .sort((left, right) => left.coordinates!.row - right.coordinates!.row || left.coordinates!.column - right.coordinates!.column);
}

function pageSize(deviceId: string): number {
  return Math.max(1, Math.min(30, sessionKeys(deviceId).length));
}

function totalPages(deviceId: string): number {
  return Math.max(1, Math.ceil(keyItemCount() / pageSize(deviceId)));
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
  refreshInFlight ??= readSessions().finally(() => {
    refreshInFlight = undefined;
  });
  return refreshInFlight;
}

async function readSessions(): Promise<void> {
  try {
    const response = await fetch(`${hubUrl}/api/sessions`, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) throw new Error(`Hub returned ${response.status}`);
    const payload = (await response.json()) as { sessions: Session[]; clients?: Client[]; settings?: HubSettings; budgets?: Budget[] };
    budgets = payload.budgets ?? [];
    if (!budgetRefreshRequested && budgetActions.size) {
      budgetRefreshRequested = true;
      void requestBudgetRefresh();
    }
    sessions = payload.sessions;
    palette = getPalette(payload.settings?.palette).id;
    const nextFlashIntensity = payload.settings?.flashIntensity;
    if (isFlashIntensity(nextFlashIntensity)) flashIntensity = nextFlashIntensity;
    showInfoKeys = payload.settings?.showInfoKeys ?? defaultShowInfoKeys;
    clients = payload.clients ?? [];
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
  if (visibleKeys.size || pagerActions.size || dashboardActions.size || infoKeys.size || settingActions.size || budgetActions.size || !refreshTimer) return;
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
    doneTimer = setTimeout(
      () => {
        doneTimer = undefined;
        doneTimerAt = undefined;
        void renderKeys(false).catch((error: unknown) => streamDeck.logger.warn("Could not update completion alert", error));
      },
      Math.max(1, deadline - Date.now()),
    );
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
  const options = { palette, flashIntensity, waitingDimmed, now: Date.now() };
  for (const key of visibleKeys.values()) {
    if (!key.coordinates) continue;
    const index = sessionIndex(key);
    if (index === undefined) {
      await key.setTitle("Reserved");
      continue;
    }
    const session = ordered[index];
    const client = session ? undefined : orderedClients()[index - ordered.length];
    if (session?.state === "waiting") hasWaiting = true;
    const completion = session && doneAttention(session, options.now);
    if (completion?.nextChangeAt !== undefined) nextDoneAt = Math.min(nextDoneAt ?? Infinity, completion.nextChangeAt);
    const keyNumber = index + 1;
    const signature = session
      ? sessionSignature(session, keyNumber, options)
      : client
        ? appSignature(client, keyNumber, palette)
        : `empty:${keyNumber}:${palette}`;
    if (renderedCards.get(key.id) !== signature) {
      const image = session
        ? sessionImage(session, keyNumber, options)
        : client
          ? appImage(client, keyNumber, palette)
          : sessionPlaceholderImage(keyNumber, palette);
      await key.setImage(svgDataUri(image));
      await key.setTitle("");
      renderedCards.set(key.id, signature);
      updatedKeys++;
    }
  }
  await renderInfoKeys(ordered);
  await renderBudgetKeys();
  updatePulseTimer(hasWaiting);
  updateDoneTimer(nextDoneAt);
  if (updatedKeys && logUpdates) streamDeck.logger.info(`Updated ${updatedKeys} session keys; ${ordered.length} sessions available`);
  if (logUpdates) {
    await renderPagers();
    await renderDashboards();
    await renderSettingControls();
  }
}

// An info key shows the session of the session key directly above it.
function sessionAbove(infoKey: KeyAction<SessionSettings>, ordered: Session[]): Session | undefined {
  const coordinates = infoKey.coordinates;
  if (!coordinates) return undefined;
  const above = sessionKeys(infoKey.device.id).find(
    (candidate) => candidate.coordinates?.column === coordinates.column && candidate.coordinates.row === coordinates.row - 1,
  );
  if (!above) return undefined;
  const index = sessionIndex(above);
  return index === undefined ? undefined : ordered[index];
}

async function renderInfoKeys(ordered: Session[]): Promise<void> {
  for (const key of infoKeys.values()) {
    const session = showInfoKeys ? sessionAbove(key, ordered) : undefined;
    const signature = session ? infoSignature(session, palette) : `info-empty:${palette}`;
    if (renderedCards.get(key.id) === signature) continue;
    await key.setImage(svgDataUri(session ? infoImage(session, palette) : infoPlaceholderImage(palette)));
    await key.setTitle("");
    renderedCards.set(key.id, signature);
  }
}

async function requestBudgetRefresh(): Promise<void> {
  try {
    const response = await fetch(`${hubUrl}/api/budgets/refresh`, { method: "POST", signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Hub returned ${response.status}`);
    budgets = ((await response.json()) as { budgets?: Budget[] }).budgets ?? budgets;
    await renderBudgetKeys();
  } catch {
    // An older hub has no refresh route. Its normal 30-second read still updates the keys.
    streamDeck.logger.warn("The hub could not read the budgets again");
  }
}

async function renderBudgetKeys(): Promise<void> {
  const now = Date.now();
  for (const { provider, action } of budgetActions.values()) {
    const budget = budgets.find((entry) => entry.provider === provider);
    const signature = budgetSignature(provider, budget, palette, now);
    if (renderedControls.get(action.id) === signature) continue;
    await action.setImage(svgDataUri(budgetImage(provider, budget, palette, now)));
    await action.setTitle("");
    renderedControls.set(action.id, signature);
  }
}

/** A budget key shows one subscription. Pressing it opens the usage page of the provider. */
class BudgetAction extends SingletonAction<SessionSettings> {
  constructor(private readonly provider: BudgetProviderId) {
    super();
  }

  async onWillAppear(event: WillAppearEvent<SessionSettings>): Promise<void> {
    if (!event.action.isKey()) return;
    budgetActions.set(event.action.id, { provider: this.provider, action: event.action });
    renderedControls.delete(event.action.id);
    await renderBudgetKeys();
    refreshTimer ??= setInterval(() => void refresh(), 1500);
    await refresh();
  }

  onWillDisappear(event: WillDisappearEvent<SessionSettings>): void {
    budgetActions.delete(event.action.id);
    renderedControls.delete(event.action.id);
    stopRefreshWhenHidden();
  }

  async onKeyDown(event: KeyDownEvent<SessionSettings>): Promise<void> {
    if (!event.action.isKey()) return;
    const provider = budgetProviders.find((entry) => entry.id === this.provider)!;
    try {
      await streamDeck.system.openUrl(provider.usageUrl);
    } catch {
      streamDeck.logger.warn(`Could not open the usage page of ${provider.title}`);
      await event.action.showAlert();
    }
  }
}

@action({ UUID: "com.local.ai-ai-captain.budget-claude" })
class ClaudeBudgetAction extends BudgetAction {
  constructor() {
    super("claude");
  }
}

@action({ UUID: "com.local.ai-ai-captain.budget-openai" })
class OpenAiBudgetAction extends BudgetAction {
  constructor() {
    super("openai");
  }
}

@action({ UUID: "com.local.ai-ai-captain.budget-copilot" })
class CopilotBudgetAction extends BudgetAction {
  constructor() {
    super("copilot");
  }
}

@action({ UUID: "com.local.ai-ai-captain.budget-jetbrains" })
class JetBrainsBudgetAction extends BudgetAction {
  constructor() {
    super("jetbrains");
  }
}

async function reuseDashboard(): Promise<boolean> {
  try {
    const response = await fetch(`${hubUrl}/api/dashboard/open`, { method: "POST", signal: AbortSignal.timeout(20000) });
    if (!response.ok) return false;
    const result = dashboardResultSchema.parse(await response.json());
    if (result.reason) streamDeck.logger.warn(result.reason);
    return result.opened;
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
    refreshTimer ??= setInterval(() => void refresh(), 1500);
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

async function focusClient(keyAction: KeyAction<SessionSettings>, client: Client): Promise<void> {
  try {
    const response = await fetch(`${hubUrl}/api/clients/${encodeURIComponent(client.id)}/focus`, { method: "POST", signal: AbortSignal.timeout(10000) });
    const result = (await response.json()) as { focused?: boolean; reason?: string };
    if (response.ok && result.focused) return;
    streamDeck.logger.warn(result.reason ?? "The hub could not focus the app");
  } catch {
    streamDeck.logger.warn("The hub could not focus the app");
  }
  await keyAction.showAlert();
}

@action({ UUID: "com.local.ai-ai-captain.session" })
class SessionKey extends SingletonAction<SessionSettings> {
  async onWillAppear(event: WillAppearEvent<SessionSettings>): Promise<void> {
    if (!event.action.isKey()) return;
    visibleKeys.set(event.action.id, event.action);
    renderedCards.delete(event.action.id);
    refreshTimer ??= setInterval(() => void refresh(), 1500);
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
    const ordered = orderedSessions();
    const session = ordered[index];
    if (!session) {
      const client = orderedClients()[index - ordered.length];
      if (client) await focusClient(event.action, client);
      return;
    }
    const pending = pendingPresses.get(event.action.id);
    if (pending) {
      clearTimeout(pending.timer);
      pendingPresses.delete(event.action.id);
      if (pending.sessionId === session.id) {
        await dismissSession(event.action, session.id);
        return;
      }
    }
    // Wait for a possible second press on a session that can be dismissed. Active sessions get focus at once.
    if (dismissableStates.includes(session.state)) {
      const action = event.action;
      const timer = setTimeout(() => {
        pendingPresses.delete(action.id);
        // A single press on a DONE key marks the completion as attended. The key then shows assessed DONE.
        if (session.state === "done") void attendSession(session.id);
        void focusSession(action, session);
      }, doublePressWindowMilliseconds);
      pendingPresses.set(action.id, { sessionId: session.id, timer });
      return;
    }
    await focusSession(event.action, session);
  }
}

async function dismissSession(keyAction: KeyAction<SessionSettings>, sessionIdentifier: string): Promise<void> {
  try {
    const response = await fetch(`${hubUrl}/api/sessions/${encodeURIComponent(sessionIdentifier)}/dismiss`, {
      method: "POST",
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) throw new Error(`Hub returned ${response.status}`);
    sessions = sessions.map((session) => (session.id === sessionIdentifier ? { ...session, dismissedAt: new Date().toISOString() } : session));
    await renderKeys();
  } catch {
    streamDeck.logger.warn("The hub could not dismiss the session");
    await keyAction.showAlert();
  }
}

async function attendSession(sessionIdentifier: string): Promise<void> {
  try {
    const response = await fetch(`${hubUrl}/api/sessions/${encodeURIComponent(sessionIdentifier)}/attend`, {
      method: "POST",
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) throw new Error(`Hub returned ${response.status}`);
    const attendedAt = new Date().toISOString();
    sessions = sessions.map((session) =>
      session.id === sessionIdentifier && session.state === "done" ? { ...session, attendedAt: session.attendedAt ?? attendedAt } : session,
    );
    await renderKeys();
  } catch {
    // The key keeps its normal DONE look. Focus still works.
    streamDeck.logger.warn("The hub could not mark the session as attended");
  }
}

async function focusSession(keyAction: KeyAction<SessionSettings>, session: Session): Promise<void> {
  // A second press within ten seconds after a failed focus removes the stale session.
  const previousFailureTime = failedFocusTimes.get(session.id);
  if (previousFailureTime !== undefined && Date.now() - previousFailureTime <= removalConfirmationWindowMilliseconds) {
    await requestSessionRemoval(keyAction, session.id);
    return;
  }
  failedFocusTimes.delete(session.id);
  try {
    const response = await fetch(`${hubUrl}/api/sessions/${encodeURIComponent(session.id)}/focus`, { method: "POST", signal: AbortSignal.timeout(10000) });
    const result = (await response.json()) as { focused?: boolean; reason?: string };
    if (!response.ok || !result.focused) {
      streamDeck.logger.warn(result.reason ?? "The hub could not focus the session");
      failedFocusTimes.set(session.id, Date.now());
      await keyAction.showAlert();
    }
  } catch {
    await keyAction.showAlert();
  }
}

@action({ UUID: "com.local.ai-ai-captain.session-info" })
class SessionInfoKey extends SingletonAction<SessionSettings> {
  async onWillAppear(event: WillAppearEvent<SessionSettings>): Promise<void> {
    if (!event.action.isKey()) return;
    infoKeys.set(event.action.id, event.action);
    renderedCards.delete(event.action.id);
    refreshTimer ??= setInterval(() => void refresh(), 1500);
    await refresh();
  }

  onWillDisappear(event: WillDisappearEvent<SessionSettings>): void {
    infoKeys.delete(event.action.id);
    renderedCards.delete(event.action.id);
    stopRefreshWhenHidden();
  }
}

const settingActions = new Map<string, { kind: SettingControlKind; action: KeyAction<SessionSettings> }>();

function currentFlashIntensity(): HubSettings["flashIntensity"] {
  return isFlashIntensity(flashIntensity) ? flashIntensity : defaultFlashIntensity;
}

function nextSettings(kind: SettingControlKind): HubSettings {
  const current: HubSettings = { palette, flashIntensity: currentFlashIntensity(), showInfoKeys };
  if (kind === "info-keys") return { ...current, showInfoKeys: !current.showInfoKeys };
  if (kind === "theme") {
    const index = paletteIds.indexOf(current.palette);
    return { ...current, palette: paletteIds[(index + 1) % paletteIds.length] ?? current.palette };
  }
  const levelCount = flashIntensityMax - flashIntensityMin + 1;
  const next = ((current.flashIntensity - flashIntensityMin + 1) % levelCount) + flashIntensityMin;
  return { ...current, flashIntensity: isFlashIntensity(next) ? next : defaultFlashIntensity };
}

async function renderSettingControls(): Promise<void> {
  const state = { palette, flashIntensity, showInfoKeys };
  for (const { kind, action } of settingActions.values()) {
    const signature = settingControlSignature(kind, state);
    if (renderedControls.get(action.id) === signature) continue;
    await action.setImage(svgDataUri(settingControlImage(kind, state)));
    await action.setTitle("");
    renderedControls.set(action.id, signature);
  }
}

class SettingControlAction extends SingletonAction<SessionSettings> {
  constructor(private readonly kind: SettingControlKind) {
    super();
  }

  async onWillAppear(event: WillAppearEvent<SessionSettings>): Promise<void> {
    if (!event.action.isKey()) return;
    settingActions.set(event.action.id, { kind: this.kind, action: event.action });
    renderedControls.delete(event.action.id);
    await renderSettingControls();
    refreshTimer ??= setInterval(() => void refresh(), 1500);
    await refresh();
  }

  onWillDisappear(event: WillDisappearEvent<SessionSettings>): void {
    settingActions.delete(event.action.id);
    renderedControls.delete(event.action.id);
    stopRefreshWhenHidden();
  }

  async onKeyDown(event: KeyDownEvent<SessionSettings>): Promise<void> {
    if (!event.action.isKey()) return;
    try {
      const response = await fetch(`${hubUrl}/api/settings`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(nextSettings(this.kind)),
        signal: AbortSignal.timeout(4000),
      });
      if (!response.ok) throw new Error(`Hub returned ${response.status}`);
      await refresh();
    } catch {
      streamDeck.logger.warn("The hub could not change the setting");
      await event.action.showAlert();
    }
  }
}

@action({ UUID: "com.local.ai-ai-captain.toggle-info-keys" })
class ToggleInfoKeysAction extends SettingControlAction {
  constructor() {
    super("info-keys");
  }
}

@action({ UUID: "com.local.ai-ai-captain.cycle-theme" })
class CycleThemeAction extends SettingControlAction {
  constructor() {
    super("theme");
  }
}

@action({ UUID: "com.local.ai-ai-captain.cycle-brightness" })
class CycleBrightnessAction extends SettingControlAction {
  constructor() {
    super("brightness");
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
    refreshTimer ??= setInterval(() => void refresh(), 1500);
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
  constructor() {
    super("previous");
  }
}

@action({ UUID: "com.local.ai-ai-captain.next-page" })
class NextPage extends PagerAction {
  constructor() {
    super("next");
  }
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
streamDeck.actions.registerAction(new SessionInfoKey());
streamDeck.actions.registerAction(new ToggleInfoKeysAction());
streamDeck.actions.registerAction(new CycleThemeAction());
streamDeck.actions.registerAction(new CycleBrightnessAction());
streamDeck.actions.registerAction(new ClaudeBudgetAction());
streamDeck.actions.registerAction(new OpenAiBudgetAction());
streamDeck.actions.registerAction(new CopilotBudgetAction());
streamDeck.actions.registerAction(new JetBrainsBudgetAction());
void streamDeck.connect().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
