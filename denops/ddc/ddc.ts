import { Candidate, Context } from "./types.ts";
import { Denops } from "./deps.ts";
import { BaseSource } from "./base/source.ts";
import { BaseFilter } from "./base/filter.ts";

export class Ddc {
  sources: Record<string, BaseSource> = {};
  filters: Record<string, BaseFilter> = {};

  async gatherCandidates(denops: Denops): Promise<Candidate[]> {
    let candidates: Candidate[] = [];
    for (const key in this.sources) {
      candidates = candidates.concat(
        await this.sources[key].gatherCandidates(denops),
      );
    }

    return candidates;
  }
  async filterCandidates(
    denops: Denops,
    cdd: Candidate[],
  ): Promise<Candidate[]> {
    const input = await denops.call("ddc#get_input", "") as string;
    let candidates = cdd;
    for (const key in this.filters) {
      const context: Context = { input: input, candidates: candidates };
      candidates = await this.filters[key].filter(denops, context);
    }

    for (const key in candidates) {
      candidates[key].icase = true;
      candidates[key].equal = true;
    }
    return candidates;
  }
}
