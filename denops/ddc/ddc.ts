import { Candidate, Context } from "./types.ts";
import { BaseSource } from "./base/source.ts";
import { BaseFilter } from "./base/filter.ts";

export class Ddc {
  sources: Record<string, BaseSource> = {};
  filters: Record<string, BaseFilter> = {};

  async gatherCandidates(vim: Any): Promise<Candidate[]> {
    let candidates: Candidate[] = [];
    for (const key in this.sources) {
      candidates = candidates.concat(
        await this.sources[key].gatherCandidates(vim),
      );
    }

    return candidates;
  }
  async filterCandidates(vim: Any, cdd: Candidate[]): Promise<Candidate[]> {
    const input = await vim.call("ddc#get_input", "");
    let candidates = cdd;
    for (const key in this.filters) {
      const context: Context = { input: input, candidates: candidates };
      candidates = await this.filters[key].filter(vim, context);
    }

    return candidates;
  }
}
