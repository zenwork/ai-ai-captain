import { EventEmitter } from "node:events";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { defaultSettings, parseStoredSettings, settingsWriteSchema, type HubSettings, type HubSettingsWrite } from "../shared/settings.js";

/** Windows can refuse to rename over a file that another program holds open. Then write the file directly. */
async function replaceFile(temporary: string, destination: string, content: string): Promise<void> {
  try {
    await rename(temporary, destination);
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    if (code !== "EPERM") throw error;
    await writeFile(destination, content, { mode: 0o600 });
    await rm(temporary, { force: true });
  }
}

export class SettingsStore {
  readonly #events = new EventEmitter();
  #settings: HubSettings = { ...defaultSettings };
  #queue = Promise.resolve();

  constructor(private readonly persistencePath?: string) {}

  async load(): Promise<void> {
    if (!this.persistencePath) return;
    try {
      this.#settings = parseStoredSettings(JSON.parse(await readFile(this.persistencePath, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  get(): HubSettings {
    return { ...this.#settings };
  }

  update(input: HubSettingsWrite): Promise<HubSettings> {
    const patch = settingsWriteSchema.parse(input);
    const operation = this.#queue.then(async () => {
      const next: HubSettings = {
        palette: patch.palette,
        flashIntensity: patch.flashIntensity ?? this.#settings.flashIntensity,
        showInfoKeys: patch.showInfoKeys ?? this.#settings.showInfoKeys,
      };
      if (settingsEqual(next, this.#settings)) return this.get();
      if (this.persistencePath) {
        await mkdir(dirname(this.persistencePath), { recursive: true });
        const temporary = `${this.persistencePath}.tmp`;
        await writeFile(temporary, JSON.stringify(next, null, 2), { mode: 0o600 });
        await replaceFile(temporary, this.persistencePath, JSON.stringify(next, null, 2));
      }
      this.#settings = next;
      this.#events.emit("change", this.get());
      return this.get();
    });
    this.#queue = operation.then(() => {}, () => {});
    return operation;
  }

  subscribe(listener: (settings: HubSettings) => void): () => void {
    this.#events.on("change", listener);
    return () => this.#events.off("change", listener);
  }

  async close(): Promise<void> {
    await this.#queue;
    this.#events.removeAllListeners();
  }
}

function settingsEqual(left: HubSettings, right: HubSettings): boolean {
  return left.palette === right.palette && left.flashIntensity === right.flashIntensity && left.showInfoKeys === right.showInfoKeys;
}
