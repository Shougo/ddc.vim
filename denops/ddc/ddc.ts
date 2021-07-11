import {
  Candidate,
  Context,
  DdcCandidate,
  DdcOptions,
  FilterOptions,
  SourceOptions,
} from "./types.ts";
import {
  foldMerge,
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

function sourceArgs(
  options: DdcOptions,
  source: BaseSource,
): [SourceOptions, Record<string, unknown>] {
  const o = foldMerge(
    mergeSourceOptions,
    defaultSourceOptions,
    [options.sourceOptions[source.name]],
  );
  const p = foldMerge(mergeSourceParams, defaultSourceParams, [
    source.params(),
    options.sourceParams[source.name],
  ]);
  return [o, p];
}

function filtersUsed(options: DdcOptions, sourceName: string): FiltersUsed {
  const mergeFiltersUsed = overwrite;
  const defaultFiltersUsed = (): FiltersUsed => ({
    matchers: [],
    sorters: [],
    converters: [],
  });
  const filtersUsed = foldMerge(mergeFiltersUsed, defaultFiltersUsed, [
    options.sourceOptions["_"],
    options.sourceOptions[sourceName],
  ]);
  return filtersUsed;
}

function filterArgs(
  filterOptions: Record<string, Partial<FilterOptions>>,
  filterParams: Record<string, Partial<Record<string, unknown>>>,
  filter: BaseFilter,
): [FilterOptions, Record<string, unknown>] {
  const optionsOf = (filter: BaseFilter) =>
    mergeFilterOptions(defaultFilterOptions(), filterOptions[filter.name]);
  const paramsOf = (filter: BaseFilter) =>
    foldMerge(mergeFilterParams, defaultFilterParams, [
      filter.params(),
      filterParams[filter.name],
    ]);
  return [optionsOf(filter), paramsOf(filter)];
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
    options: DdcOptions,
  ): Promise<DdcCandidate[]> {
    let candidates: DdcCandidate[] = [];
    const sources = options.sources.map((name) => this.sources[name])
      .filter((x) => x);

    for (const source of sources) {
      const [sourceOptions, sourceParams] = sourceArgs(options, source);
      const sourceCandidates = await source.gatherCandidates(
        denops,
        context,
        sourceOptions,
        sourceParams,
      );
      const filterCandidates = await this.filterCandidates(
        denops,
        context,
        filtersUsed(options, source.name),
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

    for (const matcher of matchers) {
      const [o, p] = filterArgs(filterOptions, filterParams, matcher);
      cdd = await matcher.filter(denops, context, o, p, cdd);
    }
    for (const sorter of sorters) {
      const [o, p] = filterArgs(filterOptions, filterParams, sorter);
      cdd = await sorter.filter(denops, context, o, p, cdd);
    }
    for (const converter of converters) {
      const [o, p] = filterArgs(filterOptions, filterParams, converter);
      cdd = await converter.filter(denops, context, o, p, cdd);
    }
    return cdd;
  }
}
