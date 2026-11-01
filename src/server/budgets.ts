import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { budgetSchema, type Budget, type BudgetInput } from "../shared/budget.js";
import type { BudgetProviderId } from "../shared/card-design.js";
import { replaceFile } from "./settings.js";

type Listener = (budgets: Budget[]) => void;

/**
 * Keeps the newest budget of each provider. With a path, the store saves the budgets in a JSON file,
 * so that reported budgets stay after a restart of the hub or the Stream Deck app.
 */
export class BudgetStore {
  readonly #budgets = new Map<BudgetProviderId, Budget>();
  readonly #listeners = new Set<Listener>();
  #queue = Promise.resolve();

  constructor(private readonly persistencePath?: string) {}

  /** Read the saved budgets. A file that is missing or not valid gives no budgets. Each budget is validated again. */
  async load(): Promise<void> {
    if (!this.persistencePath) return;
    let stored: unknown;
    try {
      stored = JSON.parse(await readFile(this.persistencePath, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" || error instanceof SyntaxError) return;
      throw error;
    }
    const entries = Array.isArray(stored) ? stored : [];
    for (const entry of entries) {
      const parsed = budgetSchema.safeParse(entry);
      if (parsed.success) this.#budgets.set(parsed.data.provider, parsed.data);
    }
  }

  list(): Budget[] {
    return [...this.#budgets.values()].sort((left, right) => left.provider.localeCompare(right.provider));
  }

  get(provider: BudgetProviderId): Budget | undefined {
    return this.#budgets.get(provider);
  }

  upsert(input: BudgetInput, updatedAt = new Date().toISOString()): Budget {
    const budget = budgetSchema.parse({ ...input, updatedAt });
    const previous = this.#budgets.get(budget.provider);
    if (previous && JSON.stringify({ ...previous, updatedAt: "" }) === JSON.stringify({ ...budget, updatedAt: "" })) return previous;
    this.#budgets.set(budget.provider, budget);
    this.#changed();
    return budget;
  }

  remove(provider: BudgetProviderId): boolean {
    const removed = this.#budgets.delete(provider);
    if (removed) this.#changed();
    return removed;
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Wait until the last change is saved. */
  async close(): Promise<void> {
    await this.#queue;
    this.#listeners.clear();
  }

  #changed(): void {
    const snapshot = this.list();
    for (const listener of this.#listeners) listener(snapshot);
    const path = this.persistencePath;
    if (!path) return;
    const content = JSON.stringify(snapshot, null, 2);
    this.#queue = this.#queue.then(async () => {
      await mkdir(dirname(path), { recursive: true });
      const temporary = `${path}.tmp`;
      await writeFile(temporary, content, { mode: 0o600 });
      await replaceFile(temporary, path, content);
    }).catch(() => undefined);
  }
}
