import type { Client, Session } from "./session.js";

export const deckColumns = 8;
export const deckRows = 4;
// The last two slots hold the previous and next page keys when the items need more than one page.
const pagerKeyCount = 2;
const minimumColumns = 2;
// A single row needs room for two pager keys and one session key.
const minimumSingleRowColumns = 3;
const minimumRows = 1;

export type DeckItem =
  | { kind: "session"; keyNumber: number; session: Session }
  | { kind: "app"; keyNumber: number; client: Client };

export interface DeckPage {
  items: DeckItem[];
  page: number;
  totalPages: number;
  columns: number;
  rows: number;
  hasPager: boolean;
}

export interface DeckGrid {
  columns: number;
  rows: number;
}

// Choose a small grid that holds all items. Prefer the shape of the available space.
export function fitDeckGrid(itemCount: number, maxColumns: number, maxRows: number): DeckGrid {
  const needed = Math.max(1, itemCount);
  const targetRatio = maxColumns / maxRows;
  let best: DeckGrid = { columns: maxColumns, rows: maxRows };
  let bestScore = Number.POSITIVE_INFINITY;
  let bestArea = Number.POSITIVE_INFINITY;
  for (let columns = 1; columns <= maxColumns; columns += 1) {
    const rows = Math.ceil(needed / columns);
    if (rows > maxRows) continue;
    const area = columns * rows;
    // The score keeps the grid small and avoids long thin strips.
    const score = area + Math.abs(columns / rows - targetRatio);
    if (score > bestScore || (score === bestScore && area >= bestArea)) continue;
    best = { columns, rows };
    bestScore = score;
    bestArea = area;
  }
  return best;
}

export function orderedSessions(sessions: readonly Session[]): Session[] {
  return [...sessions].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
}

export function orderedClients(clients: readonly Client[]): Client[] {
  return [...clients].sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}

export function deckPage(
  sessions: readonly Session[],
  clients: readonly Client[],
  requestedPage: number,
  maxColumns = deckColumns,
  maxRows = deckRows,
): DeckPage {
  const rowLimit = Math.max(minimumRows, Math.floor(maxRows));
  const columnLimit = Math.max(rowLimit === 1 ? minimumSingleRowColumns : minimumColumns, Math.floor(maxColumns));
  const items: DeckItem[] = [
    ...orderedSessions(sessions).map((session, index): DeckItem => ({ kind: "session", keyNumber: index + 1, session })),
    ...orderedClients(clients).map((client, index): DeckItem => ({ kind: "app", keyNumber: sessions.length + index + 1, client })),
  ];
  const capacity = columnLimit * rowLimit;
  const hasPager = items.length > capacity;
  const itemsPerPage = hasPager ? capacity - pagerKeyCount : capacity;
  const totalPages = Math.max(1, Math.ceil(items.length / itemsPerPage));
  const page = Math.min(Math.max(0, requestedPage), totalPages - 1);
  const start = page * itemsPerPage;
  const pageItems = items.slice(start, start + itemsPerPage);
  const grid = hasPager ? { columns: columnLimit, rows: rowLimit } : fitDeckGrid(pageItems.length, columnLimit, rowLimit);
  return { items: pageItems, page, totalPages, columns: grid.columns, rows: grid.rows, hasPager };
}
