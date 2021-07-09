import {
  BaseFilter,
  BaseSource,
  Candidate,
  Context,
  DdcCandidate,
  DdcOptions,
  defaultDdcOptions,
} from "./types.ts";
import { Denops } from "./deps.ts";

function formatMenu(prefix: string, menu: string | undefined): string {
  menu = menu ? menu : "";
  return prefix == ""
    ? menu
    : menu == ""
    ? `[${prefix}]`
    : `[${prefix}] ${menu}`;
}

export class Ddc {
  sources: Record<string, BaseSource> = {};
  filters: Record<string, BaseFilter> = {};
  options: DdcOptions = defaultDdcOptions;

  async gatherCandidates(
    denops: Denops,
    context: Context,
  ): Promise<DdcCandidate[]> {
    let candidates: DdcCandidate[] = [];
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
  ): Promise<DdcCandidate[]> {
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

    const candidates: DdcCandidate[] = [];
    for (const candidate of cs) {
      candidates.push(Object.assign(candidate, {
        source: source.name,
        icase: true,
        equal: true,
        menu: formatMenu(source.options.mark, candidate.menu),
      }));
    }

    return candidates;
  }
}
