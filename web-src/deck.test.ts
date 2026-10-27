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
  style = { setProperty: (name: string, value: string): void => { this.styleProperties.set(name, value); } };
  focus = vi.fn();

  append(element: TestElement): void {
    element.parentElement = this;
  }

  querySelector(selector: string): TestElement | null {
    return this.selectors.get(selector) ?? null;
  }

  querySelectorAll(selector: string): TestElement[] {
    if (selector !== "button[data-control]") return [];
    return [...this.selectors.values()].filter((element) => element.dataset.control !== undefined);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  connectedCallback(): void {}
  disconnectedCallback(): void {}
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
  close = vi.fn(() => this.dispatchEvent(new Event("pagehide")));
  focus = vi.fn();
  documentPictureInPicture?: { requestWindow: (options: { width: number; height: number }) => Promise<TestWindow> };
}

class TestEventSource {
  static instances: TestEventSource[] = [];
  onopen?: () => void;
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
  vi.stubGlobal("HTMLElement", class extends TestElement {
    constructor() {
      super();
      this.append(shell);
      this.selectors.set(".deck-shell", shell);
      this.selectors.set("#deck-window-placeholder", placeholder);
      this.selectors.set('button[data-window="picture-in-picture"]', floatingButton);
      this.selectors.set('button[data-window="return"]', returnButton);
      this.selectors.set("row-control", rowButton);
    }
  });
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
    const stylesheet = floatingWindow.document.createElement.mock.results[0].value;
    expect(stylesheet?.href).toBe("http://127.0.0.1:43682/styles.css");
    expect(placeholder.hidden).toBe(false);
    expect(floatingButton.textContent).toBe("Return to deck");
    expect(floatingButton.attributes.get("aria-pressed")).toBe("true");
    expect(floatingButton.disabled).toBe(false);
    expect(TestEventSource.instances).toHaveLength(1);
    expect(events.close).not.toHaveBeenCalled();
    expect(status.textContent).toBe("Hub connected");
    expect(grid.styleProperties.get("--key-size")).toBe("56px");
  });

  it("keeps live updates, size controls, and resize handling active in the floating window", async () => {
    await loadPanel();
    await click(floatingButton);
    const events = TestEventSource.instances[0];

    events.onmessage?.({ data: JSON.stringify({
      type: "snapshot",
      sessions: [{
        id: "test-session", source: "test", label: "Test session", state: "working",
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
      }],
    }) });
    expect(grid.innerHTML).toContain("Test session");
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
    mainWindow.documentPictureInPicture = { requestWindow: vi.fn(async () => { throw new Error("Private browser error"); }) };

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
