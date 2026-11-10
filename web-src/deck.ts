import { dismissableStates, hubEventSchema, type Client, type Session } from "../src/shared/session.js";
import { doneAttention } from "../src/shared/attention.js";
import { defaultFlashIntensity } from "../src/shared/settings.js";
import { isFlashIntensity } from "../src/shared/flash-intensity.js";
import { defaultPaletteId, getPalette, isPaletteId, type PaletteId } from "../src/shared/palette.js";
import { deckColumns, deckPage, deckRows, type DeckItem } from "../src/shared/deck-layout.js";
import { escapeHtml } from "./session-details.js";
import {
  cleanImage,
  appImage,
  emptyImage,
  infoImage,
  pagerImage,
  sessionImage,
  sessionTypeLabels,
  sessionType,
  waitingPulseIntervalMs,
} from "../streamdeck/src/cards.js";

const reconnectDelayMilliseconds = 3000;
const attentionRefreshMilliseconds = 1000;
const minimumKeySize = 56;
const maximumKeySize = 96;
const keyGap = 8;
const shellPadding = 40;
const statusLineHeight = 32;
const toolbarHeight = 36;
const sideControlsWidth = 92;
const compactControlHeight = 24;
const compactControlGap = 3;
const compactControlSlots = 6;
const smallestUserKeySize = 32;
const largestUserKeySize = 160;
const keySizeStep = 8;
const settingsStorageKey = "ai-ai-captain.deck";

interface DocumentPictureInPicture {
  requestWindow(options: { width: number; height: number }): Promise<Window>;
}

declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPicture;
  }
}

interface DeckViewSettings {
  keySize: number | undefined;
  singleRow: boolean;
}

function readViewSettings(): DeckViewSettings {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(settingsStorageKey) ?? "{}");
    if (typeof stored !== "object" || stored === null) return { keySize: undefined, singleRow: false };
    const record = stored as Record<string, unknown>;
    const keySize = typeof record.keySize === "number" ? Math.min(largestUserKeySize, Math.max(smallestUserKeySize, record.keySize)) : undefined;
    return { keySize, singleRow: record.singleRow === true };
  } catch {
    return { keySize: undefined, singleRow: false };
  }
}

class DeckPanel extends HTMLElement {
  #sessions: Session[] = [];
  #clients: Client[] = [];
  #palette: PaletteId = defaultPaletteId;
  // Hidden until the hub reports the setting, so the deck never shows info keys by mistake.
  #showInfoKeys = false;
  #flashIntensity = defaultFlashIntensity;
  #page = 0;
  #view = readViewSettings();
  #connected = false;
  #events?: EventSource;
  #timer?: number;
  #motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  #lastKeySize = minimumKeySize;
  #shell?: HTMLElement;
  #pictureInPictureWindow?: Window;
  #openingPictureInPicture = false;

  connectedCallback(): void {
    this.innerHTML = `<div class="deck-shell"><div id="deck-grid" class="deck-grid" ></div><div class="deck-toolbar" role="toolbar" aria-label="Deck controls"><span id="deck-status" class="deck-connection" role="status" aria-label="Connecting to hub" title="Connecting to hub">○</span><button type="button" data-control="smaller" aria-label="Smaller keys" title="Smaller keys">−</button><button type="button" data-control="auto" aria-label="Automatic key size" title="Automatic key size">Auto</button><button type="button" data-control="bigger" aria-label="Bigger keys" title="Bigger keys">+</button><button type="button" data-control="row" aria-pressed="false" title="Show all keys in a single row">Single row</button><button type="button" data-window="picture-in-picture" aria-pressed="false" title="Open the deck in an always-on-top window">Keep on top</button></div><p id="deck-window-message" class="deck-status deck-window-message" role="status" hidden></p></div><div id="deck-window-placeholder" hidden><p class="deck-status">The deck is in Picture-in-Picture. Keep this window open.</p><div class="deck-toolbar"><button type="button" data-window="return">Return to deck</button></div></div>`;
    this.#shell = this.querySelector<HTMLElement>(".deck-shell") ?? undefined;
    this.querySelectorAll<HTMLButtonElement>("button[data-control]").forEach((button) => {
      button.addEventListener("click", () => {
        this.#control(button.dataset.control ?? "");
      });
    });
    this.querySelector<HTMLButtonElement>('button[data-window="picture-in-picture"]')?.addEventListener("click", () => void this.#togglePictureInPicture());
    this.querySelector<HTMLButtonElement>('button[data-window="return"]')?.addEventListener("click", () => this.#pictureInPictureWindow?.close());
    if (!window.documentPictureInPicture) {
      const button = this.querySelector<HTMLButtonElement>('button[data-window="picture-in-picture"]');
      if (button) {
        button.disabled = true;
        button.setAttribute("aria-describedby", "deck-window-message");
      }
      this.#windowMessage("Keep on top is not available in this browser.");
    }
    this.#connect();
    this.#render();
    window.addEventListener("resize", this.#onResize);
    this.#timer = window.setInterval(() => {
      this.#render();
    }, attentionRefreshMilliseconds);
  }

  #onResize = (): void => {
    this.#render();
  };

  #viewWindow(): Window {
    return this.#pictureInPictureWindow ?? window;
  }

  #windowMessage(message: string): void {
    const element = this.#shell?.querySelector<HTMLElement>("#deck-window-message");
    if (!element) return;
    element.textContent = message;
    element.hidden = message.length === 0;
  }

  async #togglePictureInPicture(): Promise<void> {
    if (this.#pictureInPictureWindow) {
      this.#pictureInPictureWindow.close();
      return;
    }
    const api = window.documentPictureInPicture;
    const shell = this.#shell;
    const button = shell?.querySelector<HTMLButtonElement>('button[data-window="picture-in-picture"]');
    if (!api || !shell || !button || this.#openingPictureInPicture) return;
    this.#openingPictureInPicture = true;
    button.disabled = true;
    this.#windowMessage("");
    try {
      const floatingWindow = await api.requestWindow({ width: window.innerWidth, height: window.innerHeight });
      if (!this.isConnected) {
        floatingWindow.close();
        return;
      }
      this.#pictureInPictureWindow = floatingWindow;
      floatingWindow.addEventListener(
        "pagehide",
        () => {
          this.#restoreDeck(floatingWindow);
        },
        { once: true },
      );
      floatingWindow.addEventListener("resize", this.#onResize);
      floatingWindow.document.title = document.title;
      floatingWindow.document.body.className = "deck-page";
      const stylesheet = floatingWindow.document.createElement("link");
      stylesheet.rel = "stylesheet";
      stylesheet.href = new URL("/styles.css", window.location.href).href;
      stylesheet.addEventListener("load", this.#onResize, { once: true });
      floatingWindow.document.head.append(stylesheet);
      // Move the shell, not the custom element, to keep its session stream and controls active.
      floatingWindow.document.body.append(shell);
      const placeholder = this.querySelector<HTMLElement>("#deck-window-placeholder");
      if (placeholder) placeholder.hidden = false;
      button.textContent = "Return to deck";
      button.title = "Return the deck to its original window";
      button.setAttribute("aria-pressed", "true");
      this.#render();
      button.focus();
    } catch {
      this.#pictureInPictureWindow?.close();
      this.#windowMessage("Could not open Picture-in-Picture (PICTURE_IN_PICTURE_FAILED). Try again.");
    } finally {
      this.#openingPictureInPicture = false;
      button.disabled = false;
    }
  }

  #restoreDeck(floatingWindow: Window): void {
    if (this.#pictureInPictureWindow !== floatingWindow) return;
    floatingWindow.removeEventListener("resize", this.#onResize);
    this.#pictureInPictureWindow = undefined;
    if (this.#shell) this.append(this.#shell);
    const placeholder = this.querySelector<HTMLElement>("#deck-window-placeholder");
    if (placeholder) placeholder.hidden = true;
    const button = this.#shell?.querySelector<HTMLButtonElement>('button[data-window="picture-in-picture"]');
    if (button) {
      button.textContent = "Keep on top";
      button.title = "Open the deck in an always-on-top window";
      button.setAttribute("aria-pressed", "false");
      if (this.isConnected) button.focus();
    }
    this.#render();
  }

  #control(control: string): void {
    const current = this.#view.keySize ?? this.#lastKeySize;
    if (control === "smaller") this.#view.keySize = Math.max(smallestUserKeySize, current - keySizeStep);
    if (control === "bigger") this.#view.keySize = Math.min(largestUserKeySize, current + keySizeStep);
    if (control === "auto") this.#view.keySize = undefined;
    if (control === "row") this.#view.singleRow = !this.#view.singleRow;
    this.#page = 0;
    localStorage.setItem(settingsStorageKey, JSON.stringify(this.#view));
    this.#render();
  }

  disconnectedCallback(): void {
    this.#pictureInPictureWindow?.close();
    window.removeEventListener("resize", this.#onResize);
    this.#events?.close();
    if (this.#timer !== undefined) window.clearInterval(this.#timer);
  }

  #connect(): void {
    const events = new EventSource("/api/events");
    this.#events = events;
    events.onopen = () => {
      this.#connected = true;
      this.#render();
    };
    events.onerror = () => {
      this.#connected = false;
      this.#render();
      events.close();
      window.setTimeout(() => {
        this.#connect();
      }, reconnectDelayMilliseconds);
    };
    events.onmessage = (message: MessageEvent<string>) => {
      const parsed = hubEventSchema.safeParse(JSON.parse(message.data));
      // Ignore an event that does not agree with the contract. The next snapshot corrects the state.
      if (!parsed.success) return;
      const event = parsed.data;
      if (event.type === "snapshot") {
        this.#sessions = event.sessions;
        this.#clients = event.clients ?? [];
      }
      const settings = event.type === "snapshot" || event.type === "settings" ? event.settings : undefined;
      if (settings && isPaletteId(settings.palette)) {
        this.#palette = settings.palette;
        this.#showInfoKeys = settings.showInfoKeys;
        this.#flashIntensity = isFlashIntensity(settings.flashIntensity) ? settings.flashIntensity : defaultFlashIntensity;
      }
      if (event.type === "clients") this.#clients = event.clients;
      if (event.type === "upsert") {
        const updated = event.session;
        this.#sessions = [updated, ...this.#sessions.filter((session) => session.id !== updated.id)];
      }
      if (event.type === "remove" && event.id) this.#sessions = this.#sessions.filter((session) => session.id !== event.id);
      this.#render();
    };
  }

  #controlSize(keySize: number): number {
    return Math.max(20, Math.round(compactControlHeight * Math.min(1, keySize / minimumKeySize)));
  }

  #setControlSize(keySize: number): void {
    this.#shell?.style.setProperty("--control-size", `${this.#controlSize(keySize)}px`);
    this.#shell?.style.setProperty("--control-font", keySize < minimumKeySize ? "9px" : "10px");
    this.#shell?.style.setProperty("--control-line", keySize < minimumKeySize ? "9px" : "12px");
  }

  #compactControlRows(
    keySize = this.#view.keySize ?? Math.min(maximumKeySize, Math.max(minimumKeySize, this.#viewWindow().innerHeight - shellPadding - keyGap)),
  ): number {
    const gridHeight = keySize + 26;
    return Math.min(compactControlSlots, Math.max(1, Math.floor((gridHeight + compactControlGap) / (this.#controlSize(keySize) + compactControlGap))));
  }

  #compactToolbarWidth(
    keySize = this.#view.keySize ?? Math.min(maximumKeySize, Math.max(minimumKeySize, this.#viewWindow().innerHeight - shellPadding - keyGap)),
  ): number {
    this.#setControlSize(keySize);
    const selectors = [
      "#deck-status",
      'button[data-control="smaller"]',
      'button[data-control="bigger"]',
      'button[data-control="auto"]',
      'button[data-control="row"]',
      'button[data-window="picture-in-picture"]',
    ];
    const fallbackWidths = [this.#controlSize(keySize), this.#controlSize(keySize), this.#controlSize(keySize), 32, 54, 56];
    const controls = selectors.map((selector) => this.#shell?.querySelector<HTMLElement>(selector));
    for (const control of controls) control?.style.setProperty("--control-basis", "auto");
    // Measure natural widths before the buttons expand to fill each row.
    this.#shell?.style.setProperty("--control-grow", "0");
    this.#shell?.style.setProperty("--control-maximum", "56px");
    // Leave one pixel for fractional browser widths so the last button does not wrap again.
    const widths = controls.map((control, index) => (control?.offsetWidth ?? fallbackWidths[index]) + 1);
    controls.forEach((control, index) => control?.style.setProperty("--control-basis", `${widths[index] - 1}px`));
    this.#shell?.style.setProperty("--control-grow", "1");
    this.#shell?.style.setProperty("--control-maximum", "none");
    const rowLimit = this.#compactControlRows(keySize);
    const maximumWidth = widths.reduce((total, width) => total + width + compactControlGap, 0);
    for (let candidate = Math.max(...widths); candidate <= maximumWidth; candidate++) {
      let rows = 1;
      let usedWidth = 0;
      for (const width of widths) {
        const needed = usedWidth === 0 ? width : width + compactControlGap;
        if (usedWidth + needed > candidate) {
          rows++;
          usedWidth = width;
        } else {
          usedWidth += needed;
        }
      }
      if (rows <= rowLimit) return candidate;
    }
    return maximumWidth;
  }

  #availableSpace(sideControls: boolean): { width: number; height: number } {
    const viewWindow = this.#viewWindow();
    if (this.#view.singleRow) {
      const controlsWidth = this.#compactToolbarWidth();
      return { width: viewWindow.innerWidth - shellPadding - controlsWidth, height: viewWindow.innerHeight - shellPadding };
    }
    if (sideControls) return { width: viewWindow.innerWidth - shellPadding - sideControlsWidth, height: viewWindow.innerHeight - shellPadding };
    return { width: viewWindow.innerWidth - shellPadding, height: viewWindow.innerHeight - shellPadding - statusLineHeight - toolbarHeight };
  }

  // The extra attributes are a stable contract for the end-to-end tests. They do not depend on the wording of the labels.
  #keyButton(image: string, label: string, action: string, argument = "", extraAttributes = ""): string {
    return `<button class="deck-key" data-action="${action}" data-argument="${argument}"${extraAttributes} aria-label="${label}" title="${label}">${image}</button>`;
  }

  #itemButton(item: DeckItem, options: Parameters<typeof sessionImage>[2]): string {
    if (item.kind === "app")
      return this.#keyButton(
        appImage(item.client, item.keyNumber, this.#palette),
        `Key ${item.keyNumber}: ${item.client.name}, app only`,
        "focus-app",
        encodeURIComponent(item.client.id),
      );
    const { session } = item;
    const label = `Key ${item.keyNumber}: ${session.label}, ${sessionTypeLabels[sessionType(session)]}, ${session.state}`;
    const attention = doneAttention(session, options.now, options.reducedMotion)?.phase;
    const sessionAttributes = ` data-identity="${escapeHtml(session.label)}" data-state="${session.state}"${attention ? ` data-attention="${attention}"` : ""}`;
    return this.#keyButton(sessionImage(session, item.keyNumber, options), label, "focus-session", encodeURIComponent(session.id), sessionAttributes);
  }

  async #clean(): Promise<void> {
    try {
      const response = await fetch("/api/sessions/dismiss", { method: "POST", signal: AbortSignal.timeout(4000) });
      if (!response.ok) throw new Error("CLEAN_FAILED");
    } catch {
      this.#windowMessage("CLEAN_FAILED");
    }
  }

  // Move controls beside the keys when the stacked layout exceeds the window height.
  #render(): void {
    this.#shell?.classList.toggle("deck-single-row", this.#view.singleRow);

    this.#layout(this.#view.singleRow);
    if (!this.#view.singleRow && this.#shell && this.#shell.offsetHeight > this.#viewWindow().innerHeight) this.#layout(true);
  }

  #layout(sideControls: boolean): void {
    this.#shell?.classList.toggle("deck-side-controls", sideControls);
    const grid = this.#shell?.querySelector<HTMLElement>("#deck-grid");
    const status = this.#shell?.querySelector<HTMLElement>("#deck-status");
    if (!grid || !status) return;
    const now = Date.now();
    const reducedMotion = this.#motion.matches;
    const options = {
      palette: this.#palette,
      flashIntensity: this.#flashIntensity,
      now,
      reducedMotion,
      waitingDimmed: Math.floor(now / waitingPulseIntervalMs) % 2 === 1,
    };
    const available = this.#availableSpace(sideControls);
    const userKeySize = this.#view.keySize;
    const slotSize = (userKeySize ?? minimumKeySize) + keyGap;
    // A key size that the user sets removes the XL limit, so small keys can use a wide window.
    const columnCeiling = userKeySize === undefined ? deckColumns : Number.MAX_SAFE_INTEGER;
    const rowCeiling = userKeySize === undefined ? deckRows : Number.MAX_SAFE_INTEGER;
    const maxColumns = Math.min(columnCeiling, Math.max(2, Math.floor(available.width / slotSize)));
    const fittingRows = Math.min(rowCeiling, Math.max(userKeySize === undefined ? 2 : 1, Math.floor(available.height / slotSize)));
    // In the single row, each item takes two slots side by side: the key and its info key.
    const alternating = this.#showInfoKeys && this.#view.singleRow;
    const rowsPerKey = this.#showInfoKeys && !alternating ? 2 : 1;
    const slotsPerItem = alternating ? 2 : 1;
    const maxRows = this.#view.singleRow ? 1 : Math.max(1, Math.floor(fittingRows / rowsPerKey));
    // Sessions that the user dismissed on the Stream Deck stay hidden until their state changes.
    const page = deckPage(
      this.#sessions.filter((session) => !session.dismissedAt),
      this.#clients,
      this.#page,
      alternating ? Math.floor(maxColumns / slotsPerItem) : maxColumns,
      maxRows,
      1,
    );
    this.#page = page.page;
    const pageLabel = `${page.page + 1}/${page.totalPages}`;
    const automaticKeySize = Math.min(
      maximumKeySize,
      Math.floor(Math.min(available.width / (page.columns * slotsPerItem), available.height / (page.rows * rowsPerKey))) - keyGap,
    );
    const keySize = userKeySize ?? Math.max(minimumKeySize, automaticKeySize);
    this.#lastKeySize = keySize;
    this.#shell?.style.setProperty("--control-width", `${this.#compactToolbarWidth(keySize)}px`);
    grid.style.setProperty("--columns", String(page.columns * slotsPerItem));
    grid.style.setProperty("--key-size", `${keySize}px`);
    this.#shell?.querySelector("button[data-control=row]")?.setAttribute("aria-pressed", String(this.#view.singleRow));
    const pagerCount = page.hasPager ? 2 : 0;
    const emptyKey = `<div class="deck-key deck-key-empty" aria-hidden="true">${emptyImage(this.#palette)}</div>`;
    // The info key sits below its session key. Other keys get an empty key below, so the rows stay aligned.
    // In the single row, the info key sits directly after its session key, so the row alternates.
    const pair = (key: string, below: string): string => {
      if (!this.#showInfoKeys) return key;
      // Only session keys have an info key, so the single row adds no blank info keys.
      if (alternating) return below === emptyKey ? key : `${key}${below}`;
      return `<div class="deck-key-pair">${key}${below}</div>`;
    };
    const infoKey = (item: DeckItem): string => {
      if (item.kind !== "session") return emptyKey;
      return `<div class="deck-key deck-info-key" role="img" aria-label="${escapeHtml(`Info for ${item.session.label}`)}">${infoImage(item.session, this.#palette)}</div>`;
    };
    const cells = page.items.map((item) => pair(this.#itemButton(item, options), infoKey(item)));
    while (cells.length < page.columns * page.rows - pagerCount - 1) cells.push(pair(emptyKey, emptyKey));
    const cleanCount = this.#sessions.filter((session) => !session.dismissedAt && dismissableStates.includes(session.state)).length;
    const cleanDisabled = !this.#connected || cleanCount === 0 ? " disabled" : "";
    cells.push(
      pair(this.#keyButton(cleanImage(cleanCount, this.#palette), `Clean: ${cleanCount} sessions ready to hide`, "clean", "", cleanDisabled), emptyKey),
    );
    if (page.hasPager) {
      cells.push(pair(this.#keyButton(pagerImage("previous", pageLabel, this.#palette), "Previous page", "page", "-1"), emptyKey));
      cells.push(pair(this.#keyButton(pagerImage("next", pageLabel, this.#palette), "Next page", "page", "1"), emptyKey));
    }
    const markup = cells.join("");
    if (grid.dataset.markup !== markup) {
      grid.dataset.markup = markup;
      grid.innerHTML = markup;
      grid.querySelectorAll<HTMLButtonElement>("button[data-action]").forEach((button) => {
        button.addEventListener("click", () => void this.#press(button.dataset.action ?? "", button.dataset.argument ?? ""));
      });
    }
    const connectionLabel = this.#connected ? "Hub connected" : "Hub not reachable. Reconnecting…";
    const palette = getPalette(this.#palette);
    status.textContent = this.#connected ? "✓" : "!";
    status.title = connectionLabel;
    status.setAttribute("aria-label", connectionLabel);
    status.style.setProperty("--connection-color", palette.states[this.#connected ? "working" : "failed"].accent);
    status.style.setProperty("--connection-background", palette.canvas);
    status.style.setProperty("--connection-border", palette.controls.accent);
  }

  async #press(action: string, argument: string): Promise<void> {
    if (action === "clean") {
      await this.#clean();
      return;
    }
    if (action === "page") {
      this.#page += Number(argument);
      this.#render();
      return;
    }
    const path = action === "focus-app" ? `/api/clients/${argument}/focus` : `/api/sessions/${argument}/focus`;
    const response = await fetch(path, { method: "POST" });
    const result = (await response.json()) as { focused?: boolean; reason?: string };
    if (!response.ok || result.focused === false) window.alert(result.reason ?? "Could not focus that key.");
  }
}

customElements.define("deck-panel", DeckPanel);

const initialWindowWidth = 480;
const initialWindowHeight = 220;
const windowSizedStorageKey = "ai-ai-captain.deck.window-sized";

// An installed app can resize its own window. Do it once, so the size that the user sets later stays.
function sizeInstalledWindowOnce(): void {
  if (!window.matchMedia("(display-mode: standalone)").matches) return;
  if (localStorage.getItem(windowSizedStorageKey) !== null) return;
  window.resizeTo(initialWindowWidth, initialWindowHeight);
  localStorage.setItem(windowSizedStorageKey, "true");
}

sizeInstalledWindowOnce();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  void navigator.serviceWorker.register("/sw.js");
}
