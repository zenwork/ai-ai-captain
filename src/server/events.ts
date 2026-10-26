import { open } from "node:fs/promises";

export class EventCursor<State extends { apply(value: unknown): void }> {
  state: State;
  signature = "";
  #offset = 0;
  #fileIdentity = "";
  #pending = Buffer.alloc(0);
  #skipping = false;

  constructor(private readonly createState: () => State) {
    this.state = createState();
  }

  async read(path: string): Promise<void> {
    const handle = await open(path, "r");
    try {
      const info = await handle.stat();
      const identity = `${info.dev}:${info.ino}`;
      if (identity !== this.#fileIdentity || info.size < this.#offset) {
        this.#fileIdentity = identity;
        this.#offset = 0;
        this.#pending = Buffer.alloc(0);
        this.#skipping = false;
        this.state = this.createState();
      }
      const buffer = Buffer.alloc(64 * 1024);
      while (this.#offset < info.size) {
        const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, info.size - this.#offset), this.#offset);
        if (!bytesRead) break;
        this.#offset += bytesRead;
        const chunk = Buffer.concat([this.#pending, buffer.subarray(0, bytesRead)]);
        let start = 0;
        let end = chunk.indexOf(10);
        while (end >= 0) {
          if (!this.#skipping && end - start <= 8 * 1024 * 1024) {
            let event: unknown;
            try { event = JSON.parse(chunk.subarray(start, end).toString("utf8")); } catch { event = undefined; }
            this.state.apply(event);
          }
          this.#skipping = false;
          start = end + 1;
          end = chunk.indexOf(10, start);
        }
        this.#pending = Buffer.from(chunk.subarray(start));
        if (this.#skipping || this.#pending.length > 8 * 1024 * 1024) {
          this.#skipping = true;
          this.#pending = Buffer.alloc(0);
        }
      }
    } finally {
      await handle.close();
    }
  }
}
