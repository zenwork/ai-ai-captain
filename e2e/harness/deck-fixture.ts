import { chromium, type Browser, type Page } from "playwright-core";
import { z } from "zod";
import { isPaletteId, type PaletteId } from "../../src/shared/palette.js";

const keyNumberPattern = /^Key (\d+):/;
const pollIntervalMilliseconds = 100;
const defaultWaitMilliseconds = 15_000;

// CI has no display, so the browser must run headless there. A person can set this variable to see the browser while a test runs.
const headed = process.env.AI_AI_CAPTAIN_E2E_HEADED === "1" && process.env.CI === undefined;

export interface DeckOptions {
  viewport?: { width: number; height: number };
  /** The icon palette. The harness writes it to the settings of the hub before the deck opens. */
  palette?: PaletteId;
  showInfoKeys?: boolean;
  /** With `manual`, the harness controls the clock of the page. Use `advanceClock` to age a DONE session. */
  clock?: "manual";
}

export type DeckKeyKind = "session" | "info" | "app" | "pager" | "empty";
export type DeckAttention = "bright" | "dim" | "aged" | "assessed";

export interface DeckKey {
  /** The position of the key in the grid. The first key is position 1. */
  position: number;
  /** The key number that the label shows. Only session keys and app keys have one. */
  number?: number;
  kind: DeckKeyKind;
  action?: string;
  argument?: string;
  label: string;
  identity?: string;
  state?: string;
  attention?: DeckAttention;
  /** The label of the card in the SVG: "identity, detail: state, detail, palette". */
  cardLabel?: string;
  texts: string[];
  html: string;
}

export interface DeckView {
  status: string;
  keys: DeckKey[];
}

/** A copy of the deck at one time. The methods are synchronous, so an expectation can use them directly. */
export class DeckSnapshot {
  constructor(readonly view: DeckView) {}

  /** Gives the session key or the app key with this key number. */
  key(number: number): DeckKey {
    const key = this.view.keys.find((candidate) => candidate.number === number);
    if (!key) throw new Error(`The deck has no key ${String(number)}. Keys: ${this.view.keys.map((candidate) => candidate.label).join(" | ")}`);
    return key;
  }

  /** Gives the info key below or after the session key with this key number. */
  infoFor(number: number): DeckKey {
    const label = this.key(number).label.replace(keyNumberPattern, "").split(",")[0].trim();
    const info = this.view.keys.find((candidate) => candidate.kind === "info" && candidate.label === `Info for ${label}`);
    if (!info) throw new Error(`The deck has no info key for key ${String(number)}`);
    return info;
  }
}

const rawKeySchema = z.object({
  className: z.string(),
  role: z.string().nullable(),
  action: z.string().nullable(),
  argument: z.string().nullable(),
  label: z.string().nullable(),
  identity: z.string().nullable(),
  state: z.string().nullable(),
  attention: z.string().nullable(),
  cardLabel: z.string().nullable(),
  texts: z.array(z.string()),
  html: z.string(),
});
const rawViewSchema = z.object({ status: z.string(), keys: z.array(rawKeySchema) });
const attentionSchema = z.enum(["bright", "dim", "aged", "assessed"]);

type RawKey = z.infer<typeof rawKeySchema>;

function keyKind(raw: RawKey): DeckKeyKind {
  if (raw.className.includes("deck-info-key")) return "info";
  if (raw.className.includes("deck-key-empty")) return "empty";
  if (raw.action === "focus-session") return "session";
  if (raw.action === "focus-app") return "app";
  return "pager";
}

function toDeckKey(raw: RawKey, index: number): DeckKey {
  const label = raw.label ?? "";
  const keyNumber = keyNumberPattern.exec(label)?.[1];
  const attention = attentionSchema.safeParse(raw.attention);
  return {
    position: index + 1,
    ...(keyNumber ? { number: Number(keyNumber) } : {}),
    kind: keyKind(raw),
    ...(raw.action ? { action: raw.action } : {}),
    ...(raw.argument ? { argument: raw.argument } : {}),
    label,
    ...(raw.identity ? { identity: raw.identity } : {}),
    ...(raw.state ? { state: raw.state } : {}),
    ...(attention.success ? { attention: attention.data } : {}),
    ...(raw.cardLabel ? { cardLabel: raw.cardLabel } : {}),
    texts: raw.texts,
    html: raw.html,
  };
}

/** Reads the deck in the browser. This function runs in the page, so it can use only data that the page has. */
function readDeckInPage(): unknown {
  const grid = document.querySelector("#deck-grid");
  const keys = Array.from(grid?.querySelectorAll(".deck-key") ?? []).map((element) => ({
    className: element.className,
    role: element.getAttribute("role"),
    action: element.getAttribute("data-action"),
    argument: element.getAttribute("data-argument"),
    label: element.getAttribute("aria-label"),
    identity: element.getAttribute("data-identity"),
    state: element.getAttribute("data-state"),
    attention: element.getAttribute("data-attention"),
    cardLabel: element.querySelector("g[aria-label]")?.getAttribute("aria-label") ?? null,
    texts: Array.from(element.querySelectorAll("text")).map((text) => text.textContent),
    html: element.outerHTML,
  }));
  return { status: document.querySelector("#deck-status")?.textContent ?? "", keys };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

/** The virtual deck (`/deck.html`) in a headless browser. */
export class DeckFixture {
  private constructor(
    private readonly browser: Browser,
    private readonly page: Page,
    private readonly clockIsManual: boolean,
  ) {}

  static async open(hubUrl: string, options: DeckOptions = {}): Promise<DeckFixture> {
    await DeckFixture.writeSettings(hubUrl, options);
    const browser = await chromium.launch({ headless: !headed });
    try {
      const page = await browser.newPage({ viewport: options.viewport ?? { width: 900, height: 300 } });
      if (options.clock === "manual") await page.clock.install();
      await page.goto(`${hubUrl}/deck.html`);
      await page.waitForSelector("#deck-grid");
      return new DeckFixture(browser, page, options.clock === "manual");
    } catch (error) {
      await browser.close();
      throw error;
    }
  }

  private static async writeSettings(hubUrl: string, options: DeckOptions): Promise<void> {
    if (options.palette === undefined && options.showInfoKeys === undefined) return;
    const current = z.object({ settings: z.object({ palette: z.string() }) }).parse(await (await fetch(`${hubUrl}/api/settings`)).json());
    const palette = options.palette ?? current.settings.palette;
    if (!isPaletteId(palette)) throw new Error("The hub gave a palette that the harness does not know");
    const response = await fetch(`${hubUrl}/api/settings`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ palette, ...(options.showInfoKeys === undefined ? {} : { showInfoKeys: options.showInfoKeys }) }),
    });
    if (!response.ok) throw new Error(`The hub did not accept the deck settings (${String(response.status)})`);
  }

  async snapshot(): Promise<DeckSnapshot> {
    const raw = rawViewSchema.parse(await this.page.evaluate(readDeckInPage));
    return new DeckSnapshot({ status: raw.status, keys: raw.keys.map(toDeckKey) });
  }

  /** Waits until the check does not throw. The error of the last try shows when the time ends. */
  async waitFor(check: (snapshot: DeckSnapshot) => void | Promise<void>, timeoutMilliseconds = defaultWaitMilliseconds): Promise<DeckSnapshot> {
    const deadline = Date.now() + timeoutMilliseconds;
    for (;;) {
      const snapshot = await this.snapshot();
      try {
        await check(snapshot);
        return snapshot;
      } catch (error) {
        if (Date.now() >= deadline) throw error;
      }
      await delay(pollIntervalMilliseconds);
    }
  }

  /** Presses a session key or an app key, as the user does with the mouse. */
  async press(number: number): Promise<void> {
    const snapshot = await this.snapshot();
    const key = snapshot.key(number);
    await this.page.click(`#deck-grid button[aria-label="${key.label.replaceAll('"', '\\"')}"]`);
  }

  /** Moves the clock of the page forward. Only a deck with `clock: "manual"` allows it. */
  async advanceClock(milliseconds: number): Promise<void> {
    if (!this.clockIsManual) throw new Error('Set clock: "manual" in the deck options to use advanceClock');
    await this.page.clock.fastForward(milliseconds);
  }

  async close(): Promise<void> {
    await this.browser.close();
  }
}
