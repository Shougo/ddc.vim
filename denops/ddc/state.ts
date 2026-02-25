import type { Denops } from "@denops/std";
import * as vars from "@denops/std/variable";

type StateKey =
  | "ddc#_changedtick"
  | "ddc#_complete_pos"
  | "ddc#_items"
  | "ddc#_skip_next_complete"
  | "ddc#_sources";

export class State {
  #denops: Denops;
  #cache: Map<StateKey, unknown> = new Map();

  constructor(denops: Denops) {
    this.#denops = denops;
  }

  get(key: StateKey): unknown {
    return this.#cache.get(key);
  }

  async set(key: StateKey, value: unknown): Promise<void> {
    this.#cache.set(key, value);
    await vars.g.set(this.#denops, key, value);
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
}
