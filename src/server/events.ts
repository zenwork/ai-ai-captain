import { open } from "node:fs/promises";

// A longer line is not an event that the adapters use. The cursor skips it and does not keep it in memory.
const maximumLineBytes = 8 * 1024 * 1024;
const newlineCharacter = 10;

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
        this.#applyChunk(Buffer.concat([this.#pending, buffer.subarray(0, bytesRead)]));
      }
    } finally {
      await handle.close();
    }
  }

  /** Gives each complete line of the chunk to the state. Keeps the incomplete last line for the next chunk. */
  #applyChunk(chunk: Buffer): void {
    let start = 0;
    let end = chunk.indexOf(newlineCharacter);
    while (end >= 0) {
      if (!this.#skipping && end - start <= maximumLineBytes) this.#applyLine(chunk.subarray(start, end));
      this.#skipping = false;
      start = end + 1;
      end = chunk.indexOf(newlineCharacter, start);
    }
    this.#pending = Buffer.from(chunk.subarray(start));
    if (this.#skipping || this.#pending.length > maximumLineBytes) {
      this.#skipping = true;
      this.#pending = Buffer.alloc(0);
    }
  }

  /** Gives one line to the state. A line that is not JSON gives the value undefined. */
  #applyLine(line: Buffer): void {
    let event: unknown;
    try {
      event = JSON.parse(line.toString("utf8"));
    } catch {
      event = undefined;
    }
    this.state.apply(event);
  }
}
