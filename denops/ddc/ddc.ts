import { Candidate, Context } from "./types.ts";
import { Vim } from "./deps.ts";
import { BaseSource } from "./base/source.ts";
import { BaseFilter } from "./base/filter.ts";

export class Ddc {
  sources: Record<string, BaseSource> = {};
  filters: Record<string, BaseFilter> = {};

  async gatherCandidates(vim: Vim): Promise<Candidate[]> {
    let candidates: Candidate[] = [];
    for (const key in this.sources) {
      candidates = candidates.concat(
        await this.sources[key].gatherCandidates(vim),
      );
    }

    return candidates;
  }
  async filterCandidates(vim: Vim, cdd: Candidate[]): Promise<Candidate[]> {
    const input = await vim.call("ddc#get_input", "") as string;
    let candidates = cdd;
    for (const key in this.filters) {
      const context: Context = { input: input, candidates: candidates };
      candidates = await this.filters[key].filter(vim, context);
    }

    console.log(candidates);
    return candidates;
  }
}
