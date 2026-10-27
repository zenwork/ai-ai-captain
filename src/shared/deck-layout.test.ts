import { describe, expect, it } from "vitest";
import { sessionSchema, type Client } from "./session.js";
import { deckPage, fitDeckGrid } from "./deck-layout.js";

function makeSession(index: number) {
  const timestamp = new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();
  return sessionSchema.parse({ id: `s${String(index).padStart(3, "0")}`, source: "test", label: `Session ${index}`, state: "working", createdAt: timestamp, updatedAt: timestamp, lastActivityAt: timestamp });
}

function makeClient(name: string): Client {
  return { id: name.toLowerCase(), name, focusTarget: { appName: name } } as Client;
}

describe("deck layout", () => {
  it("puts sessions first by creation time and apps after them", () => {
    const page = deckPage([makeSession(2), makeSession(1)], [makeClient("Claude"), makeClient("ChatGPT")], 0);

    expect(page.items.map((item) => item.keyNumber)).toEqual([1, 2, 3, 4]);
    expect(page.items.map((item) => item.kind)).toEqual(["session", "session", "app", "app"]);
    expect(page.items[0].kind === "session" && page.items[0].session.id).toBe("s001");
    expect(page.items[2].kind === "app" && page.items[2].client.name).toBe("ChatGPT");
  });

  it("splits long lists into pages and keeps key numbers", () => {
    const deckItemsPerPage = 30;
    const itemCount = 34;
    const sessions = Array.from({ length: itemCount }, (_value, index) => makeSession(index));
    const second = deckPage(sessions, [], 1);

    expect(second.totalPages).toBe(2);
    expect(second.items.map((item) => item.keyNumber)).toEqual([deckItemsPerPage + 1, deckItemsPerPage + 2, deckItemsPerPage + 3, deckItemsPerPage + 4]);
  });

  it("limits an out-of-range page and handles an empty list", () => {
    expect(deckPage([], [], 5)).toMatchObject({ items: [], page: 0, totalPages: 1, hasPager: false });
  });

  it("uses the smallest grid that holds all keys", () => {
    expect(fitDeckGrid(1, 8, 4)).toEqual({ columns: 1, rows: 1 });
    expect(fitDeckGrid(6, 8, 4)).toEqual({ columns: 3, rows: 2 });
    expect(fitDeckGrid(7, 8, 4)).toEqual({ columns: 4, rows: 2 });
    expect(fitDeckGrid(100, 8, 4)).toEqual({ columns: 8, rows: 4 });
  });

  it("fits all keys in one row when the row limit is 1", () => {
    const page = deckPage([makeSession(1), makeSession(2), makeSession(3)], [], 0, 8, 1);

    expect(page).toMatchObject({ columns: 3, rows: 1, hasPager: false });
  });

  it("pages a single row and keeps room for the page keys", () => {
    const page = deckPage(Array.from({ length: 10 }, (_value, index) => makeSession(index)), [], 0, 5, 1);

    expect(page).toMatchObject({ columns: 5, rows: 1, hasPager: true });
    expect(page.items).toHaveLength(3);
  });

  it("shows no page keys when everything fits and uses the limits when it does not", () => {
    const fits = deckPage([makeSession(1), makeSession(2), makeSession(3)], [], 0, 8, 4);
    const tight = deckPage(Array.from({ length: 10 }, (_value, index) => makeSession(index)), [], 0, 3, 2);

    expect(fits.hasPager).toBe(false);
    expect(fits.columns * fits.rows).toBeLessThanOrEqual(4);
    expect(tight).toMatchObject({ hasPager: true, columns: 3, rows: 2, totalPages: 3 });
    expect(tight.items).toHaveLength(4);
  });
});
