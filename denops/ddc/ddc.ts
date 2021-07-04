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
    for (const key in this.sources) {
      if (!(currentSources.includes(key))) {
        continue;
      }

      const source = this.sources[key];
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
    const ctx: Context = Object.assign(context, { candidates: cdd });

    // Matchers
    for (const key in this.filters) {
      if (!(source.options.matchers.includes(key))) {
        continue;
      }

      ctx.candidates = await this.filters[key].filter(denops, ctx);
    }

    // Sorters
    for (const key in this.filters) {
      if (!(source.options.sorters.includes(key))) {
        continue;
      }

      ctx.candidates = await this.filters[key].filter(denops, ctx);
    }

    // Converters
    for (const key in this.filters) {
      if (!(source.options.converters.includes(key))) {
        continue;
      }

      ctx.candidates = await this.filters[key].filter(denops, ctx);
    }

    for (const key in ctx.candidates) {
      const candidate = ctx.candidates[key];
      candidate.source = source.name;
      candidate.icase = true;
      candidate.equal = true;
      candidate.menu = candidate.menu
        ? `[${candidate.source}] ${candidate.menu}`
        : `[${candidate.source}]`;
    }
    return ctx.candidates;
  }
}
