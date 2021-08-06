import {
  Candidate,
  Context,
  DdcCandidate,
  DdcOptions,
  FilterOptions,
  SourceOptions,
} from "./types.ts";
import {
  defaultDdcOptions,
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
import { assertEquals, Denops, toFileUrl } from "./deps.ts";

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

function byteposToCharpos(input: string, pos: number): number {
  const bytes = (new TextEncoder()).encode(input);
  return (new TextDecoder()).decode(bytes.slice(0, pos)).length;
}

function charposToBytepos(input: string, pos: number): number {
  return (new TextEncoder()).encode(input.slice(0, pos)).length;
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

export class Ddc {
  private sources: Record<string, BaseSource> = {};
  private filters: Record<string, BaseFilter> = {};

  private foundSources(names: string[]): BaseSource[] {
    return names.map((n) => this.sources[n]).filter((v) => v);
  }
  private foundFilters(names: string[]): BaseFilter[] {
    return names.map((n) => this.filters[n]).filter((v) => v);
  }

  async registerFilter(path: string, name: string) {
    const mod = await import(toFileUrl(path).href);
    const filter = new mod.Filter();
    filter.name = name;
    this.filters[filter.name] = filter;
  }
  async registerSource(path: string, name: string) {
    const mod = await import(toFileUrl(path).href);
    const source = new mod.Source();
    source.name = name;
    this.sources[source.name] = source;
  }

  async onEvent(
    denops: Denops,
    context: Context,
    options: DdcOptions,
  ): Promise<void> {
    for (const source of this.foundSources(options.sources)) {
      const [sourceOptions, sourceParams] = sourceArgs(options, source);
      await source.onEvent(
        denops,
        context,
        options,
        sourceOptions,
        sourceParams,
      );
      const filters = this.foundFilters(
        sourceOptions.matchers.concat(
          sourceOptions.sorters,
          sourceOptions.converters,
        ),
      );

      for (const filter of filters) {
        const [o, p] = filterArgs(
          options.filterOptions,
          options.filterParams,
          filter,
        );
        await filter.onEvent(denops, context, options, o, p);
      }
    }
  }

  async gatherResults(
    denops: Denops,
    context: Context,
    options: DdcOptions,
  ): Promise<[number, DdcCandidate[]]> {
    const sources = this.foundSources(options.sources)
      .map((s) => [s, ...sourceArgs(options, s)] as const);
    const rs = await Promise.all(sources.map(async ([s, o, p]) => {
      const pos = await s.getCompletePosition(
        denops,
        context,
        options,
        o,
        p,
      );
      const completePos = s.isBytePos
        ? byteposToCharpos(context.input, pos)
        : pos;
      const completeStr = context.input.slice(completePos);
      if (
        completePos < 0 ||
        completeStr.length < o.minAutoCompleteLength ||
        completeStr.length > o.maxAutoCompleteLength
      ) {
        return;
      }
      const scs = await s.gatherCandidates(
        denops,
        context,
        options,
        o,
        p,
        completeStr,
      );
      if (!scs.length) {
        return;
      }
      const fcs = await this.filterCandidates(
        denops,
        context,
        options,
        o,
        options.filterOptions,
        options.filterParams,
        completeStr,
        scs,
      );
      const candidates = fcs.map((c) => (
        {
          ...c,
          abbr: formatAbbr(c.word, c.abbr),
          source: s.name,
          icase: true,
          equal: true,
          menu: formatMenu(o.mark, c.menu),
        }
      ));
      if (!candidates.length) {
        return;
      }
      return [completePos, candidates] as const;
    }));

    // Remove invalid source
    const fs = rs.filter(<T>(v?: T): v is T => !!v);
    if (!fs.length) {
      return [-1, []];
    }

    const completePos = Math.min(...fs.map((v) => v[0]));

    // Flatten candidates
    // Todo: Merge candidates by completePos
    const candidates = fs.flatMap(([_, cs]) => cs);

    // Convert2byte for Vim
    const completePosBytes = charposToBytepos(context.input, completePos);

    return [completePosBytes, candidates];
  }

  private async filterCandidates(
    denops: Denops,
    context: Context,
    options: DdcOptions,
    sourceOptions: SourceOptions,
    filterOptions: Record<string, Partial<FilterOptions>>,
    filterParams: Record<string, Partial<Record<string, unknown>>>,
    completeStr: string,
    cdd: Candidate[],
  ): Promise<Candidate[]> {
    const matchers = this.foundFilters(sourceOptions.matchers);
    const sorters = this.foundFilters(sourceOptions.sorters);
    const converters = this.foundFilters(sourceOptions.converters);

    for (const matcher of matchers) {
      const [o, p] = filterArgs(filterOptions, filterParams, matcher);
      cdd = await matcher.filter(
        denops,
        context,
        options,
        sourceOptions,
        o,
        p,
        completeStr,
        cdd,
      );
    }
    for (const sorter of sorters) {
      const [o, p] = filterArgs(filterOptions, filterParams, sorter);
      cdd = await sorter.filter(
        denops,
        context,
        options,
        sourceOptions,
        o,
        p,
        completeStr,
        cdd,
      );
    }

    // Filter by maxCandidates
    cdd = cdd.slice(0, sourceOptions.maxCandidates);

    for (const converter of converters) {
      const [o, p] = filterArgs(filterOptions, filterParams, converter);
      cdd = await converter.filter(
        denops,
        context,
        options,
        sourceOptions,
        o,
        p,
        completeStr,
        cdd,
      );
    }
    return cdd;
  }
}

Deno.test("sourceArgs", () => {
  const userOptions: DdcOptions = {
    ...defaultDdcOptions(),
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
      _options: DdcOptions,
      _sourceOptions: SourceOptions,
      _sourceParams: Record<string, unknown>,
      _completeStr: string,
    ): Promise<Candidate[]> {
      return Promise.resolve([]);
    }
  }
  const source = new S();
  source.name = "strength";
  const [o, p] = sourceArgs(userOptions, source);
  assertEquals(o, {
    ...defaultSourceOptions(),
    mark: "S",
    matchers: ["matcher_head"],
    maxCandidates: 500,
    converters: [],
    sorters: [],
  });
  assertEquals(p.by_, undefined);
  assertEquals(p, {
    ...defaultSourceParams(),
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
      _options: DdcOptions,
      _sourceOptions: SourceOptions,
      _filterOptions: FilterOptions,
      _filterParams: Record<string, unknown>,
      _completeStr: string,
      _candidates: Candidate[],
    ): Promise<Candidate[]> {
      return Promise.resolve([]);
    }
  }
  const filter = new F();
  filter.name = "/dev/null";
  assertEquals(filterArgs(userOptions, userParams, filter), [{
    ...defaultFilterOptions(),
  }, {
    ...defaultFilterParams(),
    min: 100,
    max: 999,
  }]);
});

Deno.test("byteposToCharpos", () => {
  assertEquals(byteposToCharpos("あ hoge", 4), 2);
});

Deno.test("charposToBytepos", () => {
  assertEquals(charposToBytepos("あ hoge", 2), 4);
});
