import "@awesome.me/webawesome/dist/components/badge/badge.js";
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/icon/icon.js";
import type { Client, Session } from "../src/shared/session.js";
import { defaultFlashIntensity, defaultShowInfoKeys, settingsSchema, type HubSettings } from "../src/shared/settings.js";
import { isFlashIntensity, parseFlashIntensity } from "../src/shared/flash-intensity.js";
import { defaultPaletteId, isPaletteId, palettes, type PaletteId } from "../src/shared/palette.js";
import { doneAttention } from "../src/shared/attention.js";
import { infoImage, sessionColors, sessionImage, sessionSignature, sessionType, sessionTypeLabels, waitingPulseIntervalMs } from "../streamdeck/src/cards.js";
import { escapeHtml, sessionDetails } from "./session-details.js";
import { createSettingsPayload, flashIntensityChoices } from "./settings-controls.js";

class SessionPanel extends HTMLElement {
  #sessions: Session[] = [];
  #clients: Client[] = [];
  #connected = false;
  #attentionTimer?: number;
  #palette: PaletteId = defaultPaletteId;
  #flashIntensity = defaultFlashIntensity;
  #showInfoKeys = defaultShowInfoKeys;
  #settingsReady = false;
  #savingPalette = false;
  #events?: EventSource;
  #motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  #onMotionChange = () => this.#renderAttention();
  #expandedDetails = new Map<string, boolean>();

  connectedCallback(): void {
    this.innerHTML = `<header class="topbar"><div><p class="eyebrow">LOCAL SESSION MONITOR</p><h1>AI AI Captain</h1></div><nav class="topbar-links"><a class="deck-link" href="/deck.html" target="_blank" rel="noopener">Open deck only</a></nav><span id="connection" class="connection">Connecting…</span></header><main><section class="summary"><div><strong id="count">0</strong><span>tracked sessions</span></div><p>Session monitoring stays on this Mac.</p></section><section class="appearance" aria-label="Appearance settings"><div><label for="palette">Icon palette</label><select id="palette" aria-describedby="palette-status" disabled>${palettes.map((palette) => `<option value="${palette.id}">${escapeHtml(palette.name)}${palette.id === defaultPaletteId ? " (default)" : ""}${palette.contrast === "high" ? ` · high-contrast ${palette.mode}` : ""}</option>`).join("")}</select></div><div><label for="flash-intensity">Flash intensity</label><select id="flash-intensity" aria-describedby="palette-status" disabled>${flashIntensityChoices.map((choice) => `<option value="${choice.value}">${choice.value} · ${choice.label}</option>`).join("")}</select></div><div><label for="show-info-keys"><input type="checkbox" id="show-info-keys" aria-describedby="palette-status" disabled> Show info keys</label></div><p id="palette-status" role="status">Waiting for hub settings…</p></section><section id="deck-preview" class="deck-preview" aria-label="Session key preview"></section><p class="deck-guide">WORKING: work in progress · raised hand / WAITING: action required · check / DONE: finished, no action needed · IJ: IntelliJ · &gt;_: CLI · window: app. Key numbers match the session details below.</p><section id="sessions" class="sessions" aria-live="polite"></section><section id="clients" class="clients"></section><footer>Listening on this machine · <code>127.0.0.1:43681</code> · <a href="/THIRD_PARTY_NOTICES.txt">Artwork notices</a></footer></main>`;
    this.querySelector<HTMLSelectElement>("#palette")!.value = this.#palette;
    this.querySelector<HTMLSelectElement>("#palette")!.addEventListener("change", () => void this.#savePalette());
    this.querySelector<HTMLInputElement>("#show-info-keys")!.addEventListener("change", () => void this.#savePalette());
    this.querySelector<HTMLSelectElement>("#flash-intensity")!.value = String(this.#flashIntensity);
    this.querySelector<HTMLSelectElement>("#flash-intensity")!.addEventListener("change", () => void this.#savePalette());
    this.#motion.addEventListener("change", this.#onMotionChange);
    this.#connect();
  }

  disconnectedCallback(): void {
    if (this.#attentionTimer !== undefined) window.clearTimeout(this.#attentionTimer);
    this.#events?.close();
    this.#motion.removeEventListener("change", this.#onMotionChange);
  }

  #connect(): void {
    const events = new EventSource("/api/events");
    this.#events = events;
    events.onopen = () => {
      this.#connected = true;
      this.#updateConnection();
    };
    events.onerror = () => {
      this.#connected = false;
      this.#updateConnection();
    };
    events.onmessage = (message) => {
      const event = JSON.parse(message.data) as { type: string; sessions?: Session[]; session?: Session; id?: string; clients?: Client[]; settings?: HubSettings };
      if (event.type === "snapshot") {
        this.#sessions = event.sessions ?? [];
        this.#clients = event.clients ?? [];
      }
      if ((event.type === "snapshot" || event.type === "settings") && event.settings && isPaletteId(event.settings.palette)) {
        this.#palette = event.settings.palette;
        const nextFlashIntensity = event.settings.flashIntensity;
        this.#flashIntensity = isFlashIntensity(nextFlashIntensity) ? nextFlashIntensity : defaultFlashIntensity;
        this.#showInfoKeys = event.settings.showInfoKeys ?? defaultShowInfoKeys;
        this.#settingsReady = true;
        this.#syncPaletteControl();
      }
      if (event.type === "clients") this.#clients = event.clients ?? [];
      if (event.type === "upsert" && event.session) this.#sessions = [event.session, ...this.#sessions.filter((session) => session.id !== event.session!.id)];
      if (event.type === "remove" && event.id) {
        this.#sessions = this.#sessions.filter((session) => session.id !== event.id);
        this.#expandedDetails.delete(event.id);
      }
      this.#render();
    };
  }

  #updateConnection(): void {
    const indicator = this.querySelector<HTMLElement>("#connection");
    if (!indicator) return;
    indicator.textContent = this.#connected ? "Hub connected" : "Reconnecting";
    indicator.classList.toggle("online", this.#connected);
    this.#syncPaletteControl();
  }

  #syncPaletteControl(): void {
    const paletteSelect = this.querySelector<HTMLSelectElement>("#palette");
    const intensitySelect = this.querySelector<HTMLSelectElement>("#flash-intensity");
    const infoToggle = this.querySelector<HTMLInputElement>("#show-info-keys");
    if (!paletteSelect || !intensitySelect || !infoToggle) return;
    infoToggle.checked = this.#showInfoKeys;
    infoToggle.disabled = !this.#connected || !this.#settingsReady || this.#savingPalette;
    paletteSelect.value = this.#palette;
    intensitySelect.value = String(this.#flashIntensity);
    paletteSelect.disabled = !this.#connected || !this.#settingsReady || this.#savingPalette;
    intensitySelect.disabled = !this.#connected || !this.#settingsReady || this.#savingPalette;
    if (this.#settingsReady && !this.#savingPalette) this.querySelector<HTMLElement>("#palette-status")!.textContent = "Saved on this Mac · applies to all Stream Decks and previews.";
  }

  async #savePalette(): Promise<void> {
    const paletteSelect = this.querySelector<HTMLSelectElement>("#palette")!;
    const intensitySelect = this.querySelector<HTMLSelectElement>("#flash-intensity")!;
    const status = this.querySelector<HTMLElement>("#palette-status")!;
    const showInfoKeys = this.querySelector<HTMLInputElement>("#show-info-keys")!.checked;
    const flashIntensity = parseFlashIntensity(intensitySelect.value);
    if (!isPaletteId(paletteSelect.value) || flashIntensity === undefined) return;
    const palette = paletteSelect.value;
    this.#savingPalette = true;
    paletteSelect.disabled = true;
    intensitySelect.disabled = true;
    status.textContent = "Saving appearance…";
    let failure: string | undefined;
    try {
      const response = await fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(createSettingsPayload(palette, flashIntensity, showInfoKeys)), signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error("Settings could not be saved");
      const body: unknown = await response.json();
      if (typeof body !== "object" || body === null || !("settings" in body)) throw new Error("Invalid settings response");
      const result = settingsSchema.safeParse(body.settings);
      if (!result.success) throw new Error("Invalid settings response");
      this.#palette = result.data.palette;
      this.#flashIntensity = result.data.flashIntensity;
      this.#showInfoKeys = result.data.showInfoKeys;
      this.#render();
    } catch {
      failure = "Could not confirm the appearance change. Showing the last confirmed choices; check the connection and try again.";
    } finally {
      this.#savingPalette = false;
      this.#syncPaletteControl();
      if (failure) status.textContent = failure;
    }
  }

  #render(): void {
    const list = this.querySelector<HTMLElement>("#sessions");
    const count = this.querySelector<HTMLElement>("#count");
    if (!list || !count) return;
    const slotOrder = [...this.#sessions].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
    const keyNumbers = new Map(slotOrder.map((session, index) => [session.id, index + 1]));
    const preview = this.querySelector<HTMLElement>("#deck-preview");
    if (preview) {
      const keyOptions = { palette: this.#palette, flashIntensity: this.#flashIntensity, reducedMotion: this.#motion.matches };
      const sessionKey = (session: Session, index: number): string => `<button class="deck-key" data-focus="${escapeHtml(session.id)}" title="${escapeHtml(`${index + 1}: ${session.label} · ${sessionTypeLabels[sessionType(session)]} · ${session.model ?? "model unknown"}`)}" aria-label="${escapeHtml(`Key ${index + 1}: ${session.label}, ${session.state}`)}">${sessionImage(session, index + 1, keyOptions)}</button>`;
      const infoKey = (session: Session): string => `<div class="deck-key deck-info-key" role="img" aria-label="${escapeHtml(`Info for ${session.label}`)}">${infoImage(session, this.#palette)}</div>`;
      preview.innerHTML = this.#showInfoKeys
        ? slotOrder.map((session, index) => `<div class="deck-key-pair">${sessionKey(session, index)}${infoKey(session)}</div>`).join("")
        : slotOrder.map((session, index) => sessionKey(session, index)).join("");
      preview.querySelectorAll<HTMLElement>("[data-focus]").forEach((button) => button.addEventListener("click", () => void this.#focus(button.dataset.focus!)));
    }
    const clients = this.querySelector<HTMLElement>("#clients");
    if (clients) clients.innerHTML = this.#clients.length ? `<h2>Other detected apps</h2><p>Individual sessions are not currently available for these apps.</p><div>${this.#clients.map((client) => `<span class="client-chip">${escapeHtml(client.name)} · ${escapeHtml(client.trackingDetails ?? "app presence only")}</span>`).join("")}</div>` : "";
    const attention = (state: Session["state"]) => state === "unknown" || state === "waiting" || state === "failed" ? 0 : 1;
    const sessions = [...this.#sessions].sort((left, right) => attention(left.state) - attention(right.state) || right.updatedAt.localeCompare(left.updatedAt));
    count.textContent = String(sessions.length);
    if (!sessions.length) {
      list.innerHTML = `<article class="empty"><div class="empty-icon">✳</div><h2>No tracked sessions yet</h2><p>Open a Copilot or Codex session in your CLI or IntelliJ, or connect a harness reporter. Each session will appear separately with its current state.</p></article>`;
      this.#renderAttention();
      return;
    }
    const groups = new Map<string, Session[]>();
    for (const session of sessions) {
      const host = session.metadata?.host ?? session.focusTarget?.appName ?? "Other sessions";
      groups.set(host, [...(groups.get(host) ?? []), session]);
    }
    list.innerHTML = [...groups].map(([host, entries]) => `<section class="host-group"><h2 class="host-heading">${escapeHtml(host)} <span>${entries.length} session${entries.length === 1 ? "" : "s"}</span></h2>${entries.map((session) => `<article class="session-card" data-session-id="${escapeHtml(session.id)}"><span class="key-number">${keyNumbers.get(session.id)}</span><div class="state-dot state-${session.state}"></div><div class="session-main"><div class="session-heading"><h2>${escapeHtml(session.label)}</h2><wa-badge variant="${badgeVariant(session.state)}" pill>${escapeHtml(session.state === "unknown" ? "UNK" : session.state.toUpperCase())}</wa-badge></div><div class="session-meta">${escapeHtml(sessionTypeLabels[sessionType(session)])}${session.model ? ` · ${escapeHtml(session.model)}` : ""}${session.project ? ` · ${escapeHtml(session.project)}` : ""}</div>${sessionDetails(session, this.#expandedDetails.get(session.id))}</div><wa-button size="small" appearance="outlined" data-focus="${escapeHtml(session.id)}">${focusLabel(session)}</wa-button></article>`).join("")}</section>`).join("");
    list.querySelectorAll<HTMLElement>("[data-focus]").forEach((button) => button.addEventListener("click", () => void this.#focus(button.dataset.focus!)));
    list.querySelectorAll<HTMLDetailsElement>("details[data-details-id]").forEach((details) => details.addEventListener("toggle", () => {
      if (details.isConnected) this.#expandedDetails.set(details.dataset.detailsId!, details.open);
    }));
    this.#renderAttention();
  }

  #renderAttention(): void {
    if (this.#attentionTimer !== undefined) window.clearTimeout(this.#attentionTimer);
    this.#attentionTimer = undefined;
    const now = Date.now();
    const options = { palette: this.#palette, flashIntensity: this.#flashIntensity, now, reducedMotion: this.#motion.matches, waitingDimmed: Math.floor(now / waitingPulseIntervalMs) % 2 === 1 };
    const ordered = [...this.#sessions].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
    const sessions = new Map(ordered.map((session, index) => [session.id, { session, keyNumber: index + 1 }]));
    let nextChangeAt: number | undefined;
    if (!options.reducedMotion && this.#sessions.some((session) => session.state === "waiting")) nextChangeAt = now - now % waitingPulseIntervalMs + waitingPulseIntervalMs;
    for (const session of this.#sessions) {
      const completion = doneAttention(session, options.now, options.reducedMotion);
      if (completion?.nextChangeAt !== undefined) nextChangeAt = Math.min(nextChangeAt ?? Infinity, completion.nextChangeAt);
    }
    for (const button of Array.from(this.querySelectorAll<HTMLElement>(".deck-key[data-focus]"))) {
      const entry = sessions.get(button.dataset.focus!);
      if (!entry) continue;
      const signature = sessionSignature(entry.session, entry.keyNumber, options);
      if (button.dataset.signature !== signature) {
        button.innerHTML = sessionImage(entry.session, entry.keyNumber, options);
        button.dataset.signature = signature;
      }
    }
    for (const card of Array.from(this.querySelectorAll<HTMLElement>(".session-card[data-session-id]"))) {
      const entry = sessions.get(card.dataset.sessionId!);
      if (!entry) continue;
      const colors = sessionColors(entry.session, options);
      card.style.setProperty("--state-accent", colors.accent);
      card.style.setProperty("--state-ink", colors.ink);
      const completion = entry && doneAttention(entry.session, options.now, options.reducedMotion);
      card.classList.toggle("done-dim", completion?.phase === "dim");
      card.classList.toggle("done-aged", completion?.phase === "aged");
    }
    if (nextChangeAt !== undefined) {
      this.#attentionTimer = window.setTimeout(() => this.#renderAttention(), Math.max(1, nextChangeAt - Date.now()));
    }
  }

  async #focus(id: string): Promise<void> {
    const response = await fetch(`/api/sessions/${encodeURIComponent(id)}/focus`, { method: "POST" });
    if (!response.ok) window.alert("Could not focus that session.");
    const result = await response.json() as { focused?: boolean; reason?: string };
    if (!result.focused && result.reason) window.alert(result.reason);
  }
}

function focusLabel(session: Session): string {
  const target = session.focusTarget;
  return session.project && /intellij/i.test(`${target?.appName ?? ""} ${target?.appPath ?? ""} ${target?.bundleId ?? ""}`) ? "Focus project" : "Focus app";
}

function badgeVariant(state: Session["state"]): string {
  if (state === "waiting") return "warning";
  if (state === "failed") return "danger";
  if (state === "working") return "success";
  if (state === "done") return "brand";
  return "neutral";
}

customElements.define("session-panel", SessionPanel);

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  void navigator.serviceWorker.register("/sw.js");
}
