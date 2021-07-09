import {
  Candidate,
  Context,
  DdcCandidate,
  DdcOptions,
  FilterOptions,
} from "./types.ts";
import {
  defaultDdcOptions,
  foldMerge,
  mergeDdcOptions,
  mergeFilterOptions,
  mergeFilterParams,
  mergeSourceOptions,
  mergeSourceParams,
  overwrite,
} from "./context.ts";
import {
  BaseSource,
  defaultSourceOptions,
  defaultSourceParams,
} from "./base/source.ts";
import {
  BaseFilter,
  defaultFilterOptions,
  defaultFilterParams,
} from "./base/filter.ts";
import { Denops } from "./deps.ts";

function formatMenu(prefix: string, menu: string | undefined): string {
  menu = menu ? menu : "";
  return prefix == ""
    ? menu
    : menu == ""
    ? `[${prefix}]`
    : `[${prefix}] ${menu}`;
}

interface FiltersUsed {
  matchers: string[];
  sorters: string[];
  converters: string[];
}

export class Ddc {
  sources: Record<string, BaseSource> = {};
  filters: Record<string, BaseFilter> = {};

  async registerFilter(path: string, name: string) {
    const mod = await import(path);
    const filter = new mod.Filter();
    filter.name = name;
    this.filters[filter.name] = filter;
  }
  async registerSource(path: string, name: string) {
    const mod = await import(path);
    const source = new mod.Source();
    source.name = name;
    this.sources[source.name] = source;
  }

  async gatherCandidates(
    denops: Denops,
    context: Context,
    userOptions: Partial<DdcOptions>,
  ): Promise<DdcCandidate[]> {
    let candidates: DdcCandidate[] = [];
    const options: DdcOptions = mergeDdcOptions(
      defaultDdcOptions(),
      userOptions,
    );
    const sources = options.sources.map((name) => this.sources[name])
      .filter((x) => x);

    for (const source of sources) {
      const sourceOptions = foldMerge(
        mergeSourceOptions,
        defaultSourceOptions,
        [source.options(), options.sourceOptions[source.name]],
      );
      const sourceParams = foldMerge(mergeSourceParams, defaultSourceParams, [
        source.params(),
        options.sourceParams[source.name],
      ]);
      const sourceCandidates = await source.gatherCandidates(
        denops,
        context,
        sourceOptions,
        sourceParams,
      );
      const mergeFiltersUsed = overwrite;
      const filtersUsed = foldMerge(
        mergeFiltersUsed,
        () => ({
          matchers: options.defaultMatchers,
          sorters: options.defaultSorters,
          converters: options.defaultConverters,
        }),
        [source.options(), options.sourceOptions[source.name]],
      );
      const filterCandidates = await this.filterCandidates(
        denops,
        context,
        filtersUsed,
        options.filterOptions,
        options.filterParams,
        sourceCandidates,
      );
      const result: DdcCandidate[] = filterCandidates.map((c: Candidate) => (
        {
          ...c,
          source: source.name,
          icase: true,
          equal: true,
          menu: formatMenu(sourceOptions.mark, c.menu),
        }
      ));

      candidates = candidates.concat(result);
    }

    return candidates;
  }
  async filterCandidates(
    denops: Denops,
    context: Context,
    filtersUsed: FiltersUsed,
    filterOptions: Record<string, Partial<FilterOptions>>,
    filterParams: Record<string, Partial<Record<string, unknown>>>,
    cdd: Candidate[],
  ): Promise<Candidate[]> {
    const foundFilters = (names: string[]) =>
      names.map((name) => this.filters[name]).filter((x) => x);
    const matchers = foundFilters(filtersUsed.matchers);
    const sorters = foundFilters(filtersUsed.sorters);
    const converters = foundFilters(filtersUsed.converters);

    const foldOptions = (
      partials: (null | undefined | Partial<FilterOptions>)[],
    ) => foldMerge(mergeFilterOptions, defaultFilterOptions, partials);
    const foldParams = (
      partials: (null | undefined | Partial<Record<string, unknown>>)[],
    ) => foldMerge(mergeFilterParams, defaultFilterParams, partials);

    for (const matcher of matchers) {
      const o = foldOptions([
        matcher.options(),
        filterOptions[matcher.name],
      ]);
      const p = foldParams([
        matcher.params(),
        filterParams[matcher.name],
      ]);
      cdd = await matcher.filter(denops, context, o, p, cdd);
    }
    for (const sorter of sorters) {
      const o = foldOptions([
        sorter.options(),
        filterOptions[sorter.name],
      ]);
      const p = foldParams([
        sorter.params(),
        filterParams[sorter.name],
      ]);
      cdd = await sorter.filter(denops, context, o, p, cdd);
    }
    for (const converter of converters) {
      const o = foldOptions([
        converter.options(),
        filterOptions[converter.name],
      ]);
      const p = foldParams([
        converter.params(),
        filterParams[converter.name],
      ]);
      cdd = await converter.filter(denops, context, o, p, cdd);
    }
    return cdd;
  }
}
