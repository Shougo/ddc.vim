import { Candidate, Context, DdcOptions, defaultDdcOptions } from "./types.ts";
import { Denops } from "./deps.ts";
import { BaseSource } from "./base/source.ts";
import { BaseFilter } from "./base/filter.ts";

export class Ddc {
  sources: Record<string, BaseSource> = {};
  filters: Record<string, BaseFilter> = {};
  options: DdcOptions = defaultDdcOptions;

  async gatherCandidates(denops: Denops): Promise<Candidate[]> {
    let candidates: Candidate[] = [];
    for (const key in this.sources) {
      if (!(this.options.sources.includes(key))) {
        continue;
      }

      const source = this.sources[key];
      const sourceCandidates = await source.gatherCandidates(denops);

      // Set source name
      for (const key in sourceCandidates) {
        sourceCandidates[key].source = source.name;
      }

      candidates = candidates.concat(sourceCandidates);
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
      const context: Context = {
        input: input,
        candidates: candidates,
        options: this.options,
      };
      candidates = await this.filters[key].filter(denops, context);
    }

    for (const key in candidates) {
      const candidate = candidates[key];
      candidate.icase = true;
      candidate.equal = true;
      candidate.menu = candidate.menu
        ? `[${candidate.source}] ${candidate.menu}`
        : `[${candidate.source}]`;
    }
    return candidates;
  }
}
