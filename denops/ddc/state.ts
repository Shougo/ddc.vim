import type { Denops } from "@denops/std";
import * as vars from "@denops/std/variable";

type StateKey =
  | "ddc#_changedtick"
  | "ddc#_complete_pos"
  | "ddc#_items"
  | "ddc#_sources"
  | "ddc#_started"
  | "ddc#_context_filetype"
  | "ddc#_skip_next_complete";

const STATE_KEYS: StateKey[] = [
  "ddc#_changedtick",
  "ddc#_complete_pos",
  "ddc#_items",
  "ddc#_sources",
  "ddc#_started",
  "ddc#_context_filetype",
  "ddc#_skip_next_complete",
];

export class State {
  #denops: Denops;
  #cache: Map<StateKey, unknown> = new Map();

  constructor(denops: Denops) {
    this.#denops = denops;
  }

  async initFromVim(): Promise<void> {
    for (const key of STATE_KEYS) {
      const val = await vars.g.get(this.#denops, key);
      if (val !== undefined) {
        this.#cache.set(key, val);
      }
    }
  }

  get(key: StateKey): unknown {
    return this.#cache.get(key);
  }

  async set(key: StateKey, value: unknown): Promise<void> {
    this.#cache.set(key, value);
    await vars.g.set(this.#denops, key, value);
  }

  async incr(key: StateKey, delta = 1): Promise<void> {
    let current = this.#cache.get(key);
    // Fall back to Vim g: if not yet cached (e.g. before initFromVim completes)
    if (current === undefined) {
      current = await vars.g.get(this.#denops, key, 0);
    }
    const num = typeof current === "number" ? current : 0;
    await this.set(key, num + delta);
  }
}
