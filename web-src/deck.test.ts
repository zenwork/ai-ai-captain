import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class TestElement extends EventTarget {
  innerHTML = "";
  textContent = "";
  title = "";
  className = "";
  rel = "";
  href = "";
  hidden = false;
  disabled = false;
  isConnected = true;
  offsetHeight = 100;
  parentElement?: TestElement;
  dataset: Record<string, string> = {};
  selectors = new Map<string, TestElement>();
  attributes = new Map<string, string>();
  styleProperties = new Map<string, string>();
  classList = { toggle: vi.fn() };
  style = {
    setProperty: (name: string, value: string): void => {
      this.styleProperties.set(name, value);
    },
  };
  focus = vi.fn();

  append(element: TestElement): void {
    element.parentElement = this;
  }

  querySelector(selector: string): TestElement | null {
    return this.selectors.get(selector) ?? null;
  }

  querySelectorAll(selector: string): TestElement[] {
    if (selector === "button[data-action]" && this.innerHTML.includes('data-action="clean"')) return [cleanButton];
    if (selector !== "button[data-control]") return [];
    return [...this.selectors.values()].filter((element) => element.dataset.control !== undefined);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  connectedCallback(): void {
    // The test element has no work to do when it is added to the page.
  }

  disconnectedCallback(): void {
    // The test element has no work to do when it is removed from the page.
  }
}

class TestWindow extends EventTarget {
  innerWidth = 480;
  innerHeight = 220;
  location = { href: "http://127.0.0.1:43682/deck.html" };
  document = {
    title: "AI AI Captain Deck",
    body: new TestElement(),
    head: new TestElement(),
    createElement: vi.fn(() => new TestElement()),
  };
  matchMedia = vi.fn(() => ({ matches: false }));
  setInterval = vi.fn(() => 1);
  clearInterval = vi.fn();
  setTimeout = vi.fn();
  close = vi.fn(() => this.dispatchEvent(new Event("pagehide")));
  focus = vi.fn();
  documentPictureInPicture?: { requestWindow: (options: { width: number; height: number }) => Promise<TestWindow> };
}

class TestEventSource {
  static instances: TestEventSource[] = [];
  onopen?: () => void;
  onerror?: () => void;
  onmessage?: (message: { data: string }) => void;
  close = vi.fn();

  constructor() {
    TestEventSource.instances.push(this);
  }
}

let mainWindow: TestWindow;
let floatingWindow: TestWindow;
let shell: TestElement;
let grid: TestElement;
let status: TestElement;
let message: TestElement;
let placeholder: TestElement;
let floatingButton: TestElement;
let returnButton: TestElement;
let rowButton: TestElement;
let cleanButton: TestElement;
let createPanel: () => TestElement;

async function loadPanel(supported = true): Promise<TestElement> {
  if (supported) {
    mainWindow.documentPictureInPicture = { requestWindow: vi.fn(async () => floatingWindow) };
  }
  await import("./deck.js");
  const panel = createPanel();
  panel.connectedCallback();
  return panel;
}

async function click(element: TestElement): Promise<void> {
  element.dispatchEvent(new Event("click"));
  await Promise.resolve();
}

beforeEach(() => {
  vi.resetModules();
  mainWindow = new TestWindow();
  floatingWindow = new TestWindow();
  floatingWindow.innerWidth = 320;
  floatingWindow.innerHeight = 140;
  shell = new TestElement();
  grid = new TestElement();
  status = new TestElement();
  message = new TestElement();
  message.hidden = true;
  placeholder = new TestElement();
  placeholder.hidden = true;
  floatingButton = new TestElement();
  returnButton = new TestElement();
  cleanButton = new TestElement();
  cleanButton.dataset.action = "clean";
  shell.selectors.set("button[data-clean]", cleanButton);
  rowButton = new TestElement();
  rowButton.dataset.control = "row";
  shell.selectors.set("#deck-grid", grid);
  shell.selectors.set("#deck-status", status);
  shell.selectors.set("#deck-window-message", message);
  shell.selectors.set('button[data-window="picture-in-picture"]', floatingButton);
  shell.selectors.set("button[data-control=row]", rowButton);
  TestEventSource.instances = [];
  vi.stubGlobal("window", mainWindow);
  vi.stubGlobal("document", mainWindow.document);
  vi.stubGlobal("navigator", {});
  vi.stubGlobal("localStorage", { getItem: vi.fn(() => null), setItem: vi.fn() });
  vi.stubGlobal("EventSource", TestEventSource);
  vi.stubGlobal(
    "HTMLElement",
    class extends TestElement {
      constructor() {
        super();
        this.append(shell);
        this.selectors.set(".deck-shell", shell);
        this.selectors.set("#deck-window-placeholder", placeholder);
        this.selectors.set('button[data-window="picture-in-picture"]', floatingButton);
        this.selectors.set('button[data-window="return"]', returnButton);
        this.selectors.set("row-control", rowButton);
        for (const control of ["smaller", "bigger"]) {
          const button = new TestElement();
          button.dataset.control = control;
          this.selectors.set(`button[data-control="${control}"]`, button);
        }
        this.selectors.set("button[data-clean]", cleanButton);
      }
    },
  );
  vi.stubGlobal("customElements", {
    define: (_name: string, constructor: new () => TestElement): void => {
      createPanel = () => new constructor();
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("deck Picture-in-Picture", () => {
  it("disables the button and explains when the browser does not support it", async () => {
    await loadPanel(false);

    expect(floatingButton.disabled).toBe(true);
    expect(floatingButton.attributes.get("aria-describedby")).toBe("deck-window-message");
    expect(message.hidden).toBe(false);
    expect(message.textContent).toBe("Keep on top is not available in this browser.");
  });

  it("moves the same deck into the floating window with its styles and active session stream", async () => {
    const panel = await loadPanel();
    const events = TestEventSource.instances[0];
    events.onopen?.();

    await click(floatingButton);

    expect(panel.innerHTML).toContain("Keep on top");
    expect(mainWindow.documentPictureInPicture?.requestWindow).toHaveBeenCalledWith({ width: 480, height: 220 });
    expect(shell.parentElement).toBe(floatingWindow.document.body);
    expect(floatingWindow.document.body.className).toBe("deck-page");
    expect(floatingWindow.document.createElement).toHaveBeenCalledWith("link");
    const stylesheet: unknown = floatingWindow.document.createElement.mock.results[0]?.value;
    expect(stylesheet).toMatchObject({ href: "http://127.0.0.1:43682/styles.css" });
    expect(placeholder.hidden).toBe(false);
    expect(floatingButton.textContent).toBe("Return to deck");
    expect(floatingButton.attributes.get("aria-pressed")).toBe("true");
    expect(floatingButton.disabled).toBe(false);
    expect(TestEventSource.instances).toHaveLength(1);
    expect(events.close).not.toHaveBeenCalled();
    expect(status.textContent).toBe("✓");
    expect(status.attributes.get("aria-label")).toBe("Hub connected");
    expect(grid.styleProperties.get("--key-size")).toBe("56px");
  });

  it("keeps live updates, size controls, and resize handling active in the floating window", async () => {
    await loadPanel();
    await click(floatingButton);
    const events = TestEventSource.instances[0];

    events.onmessage?.({
      data: JSON.stringify({
        type: "snapshot",
        sessions: [
          {
            id: "test-session",
            source: "test",
            label: "Test session",
            state: "working",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastActivityAt: new Date().toISOString(),
          },
        ],
      }),
    });
    expect(grid.innerHTML).toContain("Test session");
    // An event that does not agree with the contract does not change the keys.
    events.onmessage?.({ data: JSON.stringify({ type: "upsert", session: { id: "incomplete-session", label: "Incomplete session" } }) });
    expect(grid.innerHTML).toContain("Test session");
    expect(grid.innerHTML).not.toContain("Incomplete session");
    await click(rowButton);
    expect(rowButton.attributes.get("aria-pressed")).toBe("true");

    floatingWindow.innerHeight = 480;
    floatingWindow.dispatchEvent(new Event("resize"));
    expect(grid.styleProperties.get("--key-size")).toBe("96px");
  });

  it("restores the deck, controls, and layout when the floating window closes", async () => {
    const panel = await loadPanel();
    await click(floatingButton);
    await click(rowButton);

    floatingWindow.close();

    expect(shell.parentElement).toBe(panel);
    expect(placeholder.hidden).toBe(true);
    expect(floatingButton.textContent).toBe("Keep on top");
    expect(floatingButton.attributes.get("aria-pressed")).toBe("false");
    expect(rowButton.attributes.get("aria-pressed")).toBe("true");
    expect(grid.styleProperties.get("--key-size")).toBe("96px");
    expect(TestEventSource.instances).toHaveLength(1);
    await click(floatingButton);
    expect(shell.parentElement).toBe(floatingWindow.document.body);
  });

  it.each(["floating", "original"])("closes Picture-in-Picture with the %s window's return button", async (location) => {
    const panel = await loadPanel();
    await click(floatingButton);

    await click(location === "floating" ? floatingButton : returnButton);

    expect(floatingWindow.close).toHaveBeenCalledOnce();
    expect(shell.parentElement).toBe(panel);
  });

  it("reports a safe error and allows another attempt when the browser rejects the request", async () => {
    const panel = await loadPanel();
    mainWindow.documentPictureInPicture = {
      requestWindow: vi.fn(async () => {
        throw new Error("Private browser error");
      }),
    };

    await click(floatingButton);

    expect(shell.parentElement).toBe(panel);
    expect(message.hidden).toBe(false);
    expect(message.textContent).toContain("PICTURE_IN_PICTURE_FAILED");
    expect(message.textContent).not.toContain("Private browser error");
    expect(floatingButton.disabled).toBe(false);

    mainWindow.documentPictureInPicture = { requestWindow: vi.fn(async () => floatingWindow) };
    await click(floatingButton);
    expect(message.hidden).toBe(true);
    expect(shell.parentElement).toBe(floatingWindow.document.body);
  });

  it("closes the floating window and stream when the deck element is removed", async () => {
    const panel = await loadPanel();
    await click(floatingButton);

    panel.isConnected = false;
    panel.disconnectedCallback();

    expect(floatingWindow.close).toHaveBeenCalledOnce();
    expect(TestEventSource.instances[0].close).toHaveBeenCalledOnce();
    expect(mainWindow.clearInterval).toHaveBeenCalledWith(1);
  });
});

describe("deck key contract for tests", () => {
  function session(id: string, label: string, state: string): Record<string, string> {
    const now = new Date().toISOString();
    return { id, source: "test", label, state, createdAt: now, updatedAt: now, lastActivityAt: now };
  }

  it("shows the identity and the state on the key of each session", async () => {
    await loadPanel();
    TestEventSource.instances[0].onmessage?.({ data: JSON.stringify({ type: "snapshot", sessions: [session("one", "Shop · 1a2b3c", "working")] }) });
    expect(grid.innerHTML).toContain('data-identity="Shop · 1a2b3c"');
    expect(grid.innerHTML).toContain('data-state="working"');
    expect(grid.innerHTML).not.toContain("data-attention");
  });

  it("shows the attention phase on the key of a DONE session", async () => {
    await loadPanel();
    TestEventSource.instances[0].onmessage?.({ data: JSON.stringify({ type: "snapshot", sessions: [session("two", "Shop · 4d5e6f", "done")] }) });
    expect(grid.innerHTML).toMatch(/data-state="done" data-attention="(?:bright|dim)"/);
  });
});

describe("virtual deck CLEAN", () => {
  it("counts eligible sessions, calls the hub, and follows shared updates", async () => {
    await loadPanel();
    const events = TestEventSource.instances[0];
    expect(grid.innerHTML).toContain('data-action="clean"');
    events.onopen?.();
    const completed = {
      id: "complete",
      source: "test",
      label: "Complete",
      state: "done",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
    };
    events.onmessage?.({ data: JSON.stringify({ type: "snapshot", sessions: [completed, { ...completed, id: "active", state: "working" }] }) });
    expect(grid.innerHTML).toContain(">1 READY<");
    const fetchHub = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchHub);
    await click(cleanButton);
    expect(fetchHub).toHaveBeenCalledWith("/api/sessions/dismiss", expect.objectContaining({ method: "POST" }));
    events.onmessage?.({ data: JSON.stringify({ type: "upsert", session: { ...completed, dismissedAt: new Date().toISOString() } }) });
    expect(grid.innerHTML).toContain(">0 READY<");
    expect(grid.innerHTML).toContain('data-action="clean" data-argument="" disabled');
    fetchHub.mockRejectedValueOnce(new Error("Test failure"));
    await click(cleanButton);
    await Promise.resolve();
    expect(message.textContent).toBe("CLEAN_FAILED");
  });
});

describe("single row controls", () => {
  it("packs controls within the session row height as the window changes", async () => {
    await loadPanel();
    mainWindow.innerHeight = 120;
    await click(rowButton);
    expect(shell.classList.toggle).toHaveBeenCalledWith("deck-single-row", true);
    expect(shell.classList.toggle).toHaveBeenCalledWith("deck-side-controls", true);
    const shortWidth = Number.parseFloat(shell.styleProperties.get("--control-width") ?? "0");
    mainWindow.innerHeight = 400;
    mainWindow.dispatchEvent(new Event("resize"));
    expect(Number.parseFloat(shell.styleProperties.get("--control-width") ?? "0")).toBeLessThan(shortWidth);
    await click(rowButton);
    expect(shell.classList.toggle).toHaveBeenCalledWith("deck-single-row", false);
  });
});

describe("control size", () => {
  it("shrinks controls with the keys and restores their size with plus", async () => {
    const panel = await loadPanel();
    await click(rowButton);
    const smaller = panel.selectors.get('button[data-control="smaller"]');
    const bigger = panel.selectors.get('button[data-control="bigger"]');
    if (!smaller || !bigger) throw new Error("SIZE_CONTROLS_MISSING");
    for (let press = 0; press < 10; press++) await click(smaller);
    expect(grid.styleProperties.get("--key-size")).toBe("32px");
    expect(shell.styleProperties.get("--control-size")).toBe("20px");
    for (let press = 0; press < 3; press++) await click(bigger);
    expect(shell.styleProperties.get("--control-size")).toBe("24px");
  });
});

describe("connection card", () => {
  it("shows connection changes with a symbol, color, and accessible label", async () => {
    await loadPanel();
    const events = TestEventSource.instances[0];
    expect(status.textContent).toBe("!");
    const unavailableColor = status.styleProperties.get("--connection-color");
    events.onopen?.();
    expect(status.textContent).toBe("✓");
    expect(status.title).toBe("Hub connected");
    expect(status.attributes.get("aria-label")).toBe("Hub connected");
    expect(status.styleProperties.get("--connection-color")).not.toBe(unavailableColor);
    events.onerror?.();
    expect(status.textContent).toBe("!");
    expect(status.title).toBe("Hub not reachable. Reconnecting…");
    expect(status.styleProperties.get("--connection-color")).toBe(unavailableColor);
  });
});
