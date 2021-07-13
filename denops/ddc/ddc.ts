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
import { assertEquals, Denops } from "./deps.ts";

function formatAbbr(word: string, abbr: string | undefined): string {
  return abbr ? abbr : word;
}

function formatMenu(prefix: string, menu: string | undefined): string {
  menu = menu ? menu : "";
  return prefix == ""
    ? menu
    : menu == ""
    ? `[${prefix}]`
    : `[${prefix}] ${menu}`;
}

function sourceArgs(
  options: DdcOptions,
  source: BaseSource,
): [SourceOptions, Record<string, unknown>] {
  const o = foldMerge(
    mergeSourceOptions,
    defaultSourceOptions,
    [options.sourceOptions["_"], options.sourceOptions[source.name]],
  );
  const p = foldMerge(mergeSourceParams, defaultSourceParams, [
    source.params(),
    options.sourceParams[source.name],
  ]);
  return [o, p];
}

function filterArgs(
  filterOptions: Record<string, Partial<FilterOptions>>,
  filterParams: Record<string, Partial<Record<string, unknown>>>,
  filter: BaseFilter,
): [FilterOptions, Record<string, unknown>] {
  // TODO: '_'?
  const optionsOf = (filter: BaseFilter) =>
    foldMerge(mergeFilterOptions, defaultFilterOptions, [
      filterOptions[filter.name],
    ]);
  const paramsOf = (filter: BaseFilter) =>
    foldMerge(mergeFilterParams, defaultFilterParams, [
      filter.params(),
      filterParams[filter.name],
    ]);
  return [optionsOf(filter), paramsOf(filter)];
}

type FiltersUsed = {
  matchers: string[];
  sorters: string[];
  converters: string[];
};

function filtersUsed(options: DdcOptions, sourceName: string): FiltersUsed {
  const filtersUsed = foldMerge(merge, empty, [
    options.sourceOptions["_"],
    options.sourceOptions[sourceName],
  ]);
  return filtersUsed;

  function merge(a: FiltersUsed, b: Partial<FiltersUsed>): FiltersUsed {
    return { ...a, ...b };
  }
  function empty(): FiltersUsed {
    return {
      matchers: [],
      sorters: [],
      converters: [],
    };
  }
}

export class Ddc {
  private sources: Record<string, BaseSource> = {};
  private filters: Record<string, BaseFilter> = {};

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
        sourceOptions,
        sourceCandidates,
      );
      const result: DdcCandidate[] = filterCandidates.map((c: Candidate) => (
        {
          ...c,
          abbr: formatAbbr(c.word, c.abbr),
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

  private async filterCandidates(
    denops: Denops,
    context: Context,
    filtersUsed: FiltersUsed,
    filterOptions: Record<string, Partial<FilterOptions>>,
    filterParams: Record<string, Partial<Record<string, unknown>>>,
    sourceOptions: SourceOptions,
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

    // Filter by maxCandidates
    cdd = cdd.slice(0, sourceOptions.maxCandidates);

    for (const converter of converters) {
      const [o, p] = filterArgs(filterOptions, filterParams, converter);
      cdd = await converter.filter(denops, context, o, p, cdd);
    }
    return cdd;
  }
}

Deno.test("sourceArgs", () => {
  const userOptions: DdcOptions = {
    completionMode: "inline",
    sources: ["strength"],
    sourceOptions: {
      "_": {
        mark: "A",
        matchers: ["matcher_head"],
      },
      "strength": {
        mark: "S",
      },
    },
    sourceParams: {
      "_": {
        "by_": "bar",
      },
      "strength": {
        min: 100,
      },
    },
    filterOptions: {},
    filterParams: {},
  };
  class S extends BaseSource {
    params() {
      return {
        "min": 0,
        "max": 999,
      };
    }
    gatherCandidates(
      _denops: Denops,
      _context: Context,
      _options: SourceOptions,
      _params: Record<string, unknown>,
    ): Promise<Candidate[]> {
      return Promise.resolve([]);
    }
  }
  const source = new S();
  source.name = "strength";
  const [o, p] = sourceArgs(userOptions, source);
  assertEquals(o, {
    mark: "S",
    matchers: ["matcher_head"],
    maxCandidates: 500,
    converters: [],
    sorters: [],
  });
  assertEquals(p.by_, undefined);
  assertEquals(p, {
    min: 100,
    max: 999,
  });
});

Deno.test("filterArgs", () => {
  const userOptions: Record<string, FilterOptions> = {
    "/dev/null": {
      placeholder: undefined,
    },
  };
  const userParams: Record<string, Record<string, unknown>> = {
    "/dev/null": {
      min: 100,
    },
  };
  class F extends BaseFilter {
    params() {
      return {
        "min": 0,
        "max": 999,
      };
    }
    filter(
      _denops: Denops,
      _context: Context,
      _options: FilterOptions,
      _params: Record<string, unknown>,
      _candidates: Candidate[],
    ): Promise<Candidate[]> {
      return Promise.resolve([]);
    }
  }
  const filter = new F();
  filter.name = "/dev/null";
  assertEquals(filterArgs(userOptions, userParams, filter), [{
    placeholder: undefined,
  }, { min: 100, max: 999 }]);
});

Deno.test("filtersUsed", () => {
  const userOptions: DdcOptions = {
    completionMode: "inline",
    sources: [],
    sourceOptions: {
      "_": {
        matchers: ["matcher_head"],
      },
      "around": {
        matchers: [],
        sorters: ["O(1)"],
      },
    },
    filterOptions: {},
    sourceParams: {},
    filterParams: {},
  };
  assertEquals(filtersUsed(userOptions, "around"), {
    matchers: [],
    sorters: ["O(1)"],
    converters: [],
  });
  assertEquals(filtersUsed(userOptions, "foo"), {
    matchers: ["matcher_head"],
    sorters: [],
    converters: [],
  });
});
