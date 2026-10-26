import type { Client } from "../shared/session.js";

export class ClientRegistry {
  #clients: Client[] = [];
  readonly #listeners = new Set<(clients: Client[]) => void>();

  list(): Client[] {
    return [...this.#clients];
  }

  replace(clients: Client[]): void {
    if (JSON.stringify(this.#clients) === JSON.stringify(clients)) return;
    this.#clients = clients;
    for (const listener of this.#listeners) listener(this.list());
  }

  subscribe(listener: (clients: Client[]) => void): () => void {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  }
}
