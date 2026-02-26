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

  // items debounce / sync support
  #pendingItems: DdcItem[] | null = null;
  #itemsTimer: number | null = null;
  #debounceMs: number;
  #syncFn: SyncFn;

  constructor(denops: Denops, opts?: { debounceMs?: number; syncFn?: SyncFn }) {
    this.#denops = denops;
    this.#debounceMs = opts?.debounceMs ?? 50;
    // default sync uses vars.g.set
    this.#syncFn = opts?.syncFn ?? (async (d, k, v) => {
      await vars.g.set(d, k, v);
    });
  }

  get(key: StateKey): unknown {
    return this.#cache.get(key);
  }

  async set(key: StateKey, value: unknown): Promise<void> {
    this.#cache.set(key, value);
    await this.#syncFn(this.#denops, key, value);
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

  // Immediate set with diff check (no-op if identical)
  async setItems(items: DdcItem[]): Promise<void> {
    const prev = (this.#cache.get("ddc#_items") as DdcItem[]) ?? [];
    if (State.itemsEqual(prev, items)) {
      return;
    }
    this.#cache.set("ddc#_items", items);
    await this.#syncFn(this.#denops, "ddc#_items", items);
  }

  // Debounced scheduling: multiple calls within debounce window result in one
  // sync.
  scheduleItemsSync(items: DdcItem[]): void {
    this.#pendingItems = items;
    if (this.#itemsTimer !== null) {
      clearTimeout(this.#itemsTimer);
    }
    // setTimeout returns number in Deno
    this.#itemsTimer = setTimeout(async () => {
      const p = this.#pendingItems ?? [];
      this.#pendingItems = null;
      this.#itemsTimer = null;
      try {
        await this.setItems(p);
      } catch (e) {
        console.error("ddc: failed to sync items:", e);
      }
    }, this.#debounceMs) as unknown as number;
  }

  // Force immediate flush of pending items
  async flushItemsSync(): Promise<void> {
    if (this.#itemsTimer !== null) {
      clearTimeout(this.#itemsTimer);
      this.#itemsTimer = null;
    }
    if (this.#pendingItems !== null) {
      const p = this.#pendingItems;
      this.#pendingItems = null;
      await this.setItems(p);
    }
  }

  // Simple equality check: length + JSON.stringify (safe fallback)
  private static itemsEqual(a: DdcItem[], b: DdcItem[]): boolean {
    if (a.length !== b.length) return false;
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
}
