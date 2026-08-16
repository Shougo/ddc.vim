import type { DdcItem } from "./types.ts";
import type { Denops } from "@denops/std";
import * as vars from "@denops/std/variable";

type StateKey =
  | "ddc#_changedtick"
  | "ddc#_complete_pos"
  | "ddc#_items"
  | "ddc#_skip_next_complete"
  | "ddc#_sources";

export type SyncFn = (
  denops: Denops,
  key: string,
  value: unknown,
) => Promise<void>;

export class State {
  #denops: Denops;
  #cache: Map<StateKey, unknown> = new Map();

  // Items debounce / sync support
  #pendingItems: DdcItem[] | null = null;
  #itemsTimer: ReturnType<typeof setTimeout> | null = null;
  #itemsGeneration = 0;
  #debounceMs: number;
  #syncFn: SyncFn;
  #syncQueue: Promise<void> = Promise.resolve();

  constructor(
    denops: Denops,
    opts?: { debounceMs?: number; syncFn?: SyncFn },
  ) {
    this.#denops = denops;
    this.#debounceMs = opts?.debounceMs ?? 50;

    // Default sync uses vars.g.set.
    this.#syncFn = opts?.syncFn ?? (async (d, k, v) => {
      await vars.g.set(d, k, v);
    });
  }

  get(key: StateKey): unknown {
    return this.#cache.get(key);
  }

  #enqueueSync(key: StateKey, value: unknown): Promise<void> {
    const sync = this.#syncQueue.then(() =>
      this.#syncFn(this.#denops, key, value)
    );

    // Keep the queue usable even if one synchronization fails.
    this.#syncQueue = sync.catch(() => {});

    return sync;
  }

  async set(key: StateKey, value: unknown): Promise<void> {
    this.#cache.set(key, value);
    await this.#enqueueSync(key, value);
  }

  async setFromVim(key: StateKey): Promise<void> {
    const val = await vars.g.get(this.#denops, key);
    if (val !== undefined) {
      this.#cache.set(key, val);
    }
  }

  async inc(key: StateKey, delta = 1): Promise<void> {
    const current = this.#cache.get(key);
    if (current === undefined) {
      return;
    }

    const num = typeof current === "number" ? current : 0;
    await this.set(key, num + delta);
  }

  #cancelPendingItems(): void {
    this.#itemsGeneration++;

    if (this.#itemsTimer !== null) {
      clearTimeout(this.#itemsTimer);
      this.#itemsTimer = null;
    }

    this.#pendingItems = null;
  }

  async #syncItems(items: DdcItem[]): Promise<void> {
    const prev = (this.#cache.get("ddc#_items") as DdcItem[]) ?? [];

    if (State.itemsEqual(prev, items)) {
      return;
    }

    this.#cache.set("ddc#_items", items);
    await this.#enqueueSync("ddc#_items", items);
  }

  // Immediate set with diff check.
  async setItems(items: DdcItem[]): Promise<void> {
    this.#cancelPendingItems();
    await this.#syncItems([...items]);
  }

  // Debounced scheduling: multiple calls within the debounce window result in
  // one synchronization.
  scheduleItemsSync(items: DdcItem[]): void {
    const generation = ++this.#itemsGeneration;
    this.#pendingItems = [...items];

    if (this.#itemsTimer !== null) {
      clearTimeout(this.#itemsTimer);
    }

    this.#itemsTimer = setTimeout(async () => {
      if (generation !== this.#itemsGeneration) {
        return;
      }

      const pendingItems = this.#pendingItems ?? [];
      this.#pendingItems = null;
      this.#itemsTimer = null;

      try {
        await this.#syncItems(pendingItems);
      } catch (e) {
        console.error("ddc: failed to sync items:", e);
      }
    }, this.#debounceMs);
  }

  // Force immediate flush of pending items.
  async flushItemsSync(): Promise<void> {
    this.#itemsGeneration++;

    if (this.#itemsTimer !== null) {
      clearTimeout(this.#itemsTimer);
      this.#itemsTimer = null;
    }

    if (this.#pendingItems !== null) {
      const pendingItems = this.#pendingItems;
      this.#pendingItems = null;
      await this.#syncItems(pendingItems);
    }
  }

  // Simple equality check: length + JSON.stringify.
  private static itemsEqual(a: DdcItem[], b: DdcItem[]): boolean {
    if (a.length !== b.length) {
      return false;
    }

    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
}
