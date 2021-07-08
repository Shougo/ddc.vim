import {
  BaseFilter,
  BaseSource,
  Candidate,
  Context,
  DdcOptions,
  defaultDdcOptions,
} from "./types.ts";
import { Denops } from "./deps.ts";

export class Ddc {
  sources: Record<string, BaseSource> = {};
  filters: Record<string, BaseFilter> = {};
  options: DdcOptions = defaultDdcOptions;

  async gatherCandidates(
    denops: Denops,
    context: Context,
  ): Promise<Candidate[]> {
    let candidates: Candidate[] = [];
    const currentSources: string[] = "_" in context.options.sources
      ? context.options.sources._
      : [];
    for (const key in currentSources) {
      if (!(currentSources[key] in this.sources)) {
        continue;
      }

      const source = this.sources[currentSources[key]];
      const sourceCandidates = await source.gatherCandidates(denops);

      candidates = candidates.concat(
        await this.filterCandidates(
          denops,
          context,
          source,
          sourceCandidates,
        ),
      );
    }

    return candidates;
  }
  async filterCandidates(
    denops: Denops,
    context: Context,
    source: BaseSource,
    cdd: Candidate[],
  ): Promise<Candidate[]> {
    let cs = cdd;
    // Matchers
    for (const key in this.filters) {
      if (!(source.options.matchers.includes(key))) {
        continue;
      }

      cs = await this.filters[key].filter(denops, context, cs);
    }

    // Sorters
    for (const key in this.filters) {
      if (!(source.options.sorters.includes(key))) {
        continue;
      }

      cs = await this.filters[key].filter(denops, context, cs);
    }

    // Converters
    for (const key in this.filters) {
      if (!(source.options.converters.includes(key))) {
        continue;
      }

      cs = await this.filters[key].filter(denops, context, cs);
    }

    for (const candidate of cs) {
      candidate.source = source.name;
      candidate.icase = true;
      candidate.equal = true;
      candidate.menu = candidate.menu
        ? `[${candidate.source}] ${candidate.menu}`
        : `[${candidate.source}]`;
    }
    return cs;
  }
}
