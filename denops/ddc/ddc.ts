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
  GatherCandidatesArguments,
} from "./base/source.ts";
import {
  BaseFilter,
  defaultFilterOptions,
  defaultFilterParams,
  FilterArguments,
} from "./base/filter.ts";
import {
  assertEquals,
  autocmd,
  Denops,
  fn,
  op,
  parse,
  toFileUrl,
} from "./deps.ts";

type DdcResult = {
  candidates: Candidate[];
  completeStr: string;
  lineNr: number;
};

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
  private checkPaths: Record<string, boolean> = {};
  private prevResults: Record<string, DdcResult> = {};
  private events: string[] = [];
  private prevRuntimepath = "";

  private foundSources(names: string[]): BaseSource[] {
    return names.map((n) => this.sources[n]).filter((v) => v);
  }
  private foundFilters(names: string[]): BaseFilter[] {
    return names.map((n) => this.filters[n]).filter((v) => v);
  }

  private foundInvalidSources(names: string[]): string[] {
    return names.filter((n) => !this.sources[n]);
  }
  private foundInvalidFilters(names: string[]): string[] {
    return names.filter((n) => !this.filters[n]);
  }

  async registerAutocmd(denops: Denops, events: string[]) {
    await autocmd.group(denops, "ddc", (helper: autocmd.GroupHelper) => {
      for (const event of events) {
        if (!this.events.includes(event)) {
          helper.define(
            event as autocmd.AutocmdEvent,
            "*",
            `call denops#notify('${denops.name}', 'onEvent',["${event}"])`,
          );
          this.events.push(event);
        }
      }
    });
  }

  async registerSource(denops: Denops, path: string, name: string) {
    if (path in this.checkPaths) {
      return;
    }

    this.checkPaths[path] = true;

    const mod = await import(toFileUrl(path).href);
    const source = new mod.Source();
    source.name = name;
    source?.apiVersion ? source.onInit({ denops }) : source.onInit(denops);
    this.sources[source.name] = source;
    if (source.events && source.events.length != 0) {
      this.registerAutocmd(denops, source.events);
    }
  }
  async registerFilter(denops: Denops, path: string, name: string) {
    if (path in this.checkPaths) {
      return;
    }

    this.checkPaths[path] = true;

    const mod = await import(toFileUrl(path).href);
    const filter = new mod.Filter();
    filter.name = name;
    filter?.apiVersion ? filter.onInit({ denops }) : filter.onInit(denops);
    this.filters[filter.name] = filter;
    if (filter.events && filter.events.length != 0) {
      this.registerAutocmd(denops, filter.events);
    }
  }

  async autoload(denops: Denops) {
    const runtimepath = await op.runtimepath.getGlobal(denops);
    if (runtimepath == this.prevRuntimepath) {
      return;
    }

    this.prevRuntimepath = runtimepath;

    const sources = await fn.globpath(
      denops,
      runtimepath,
      "denops/ddc-sources/*.ts",
      1,
      1,
    ) as string[];
    const filters = await fn.globpath(
      denops,
      runtimepath,
      "denops/ddc-filters/*.ts",
      1,
      1,
    ) as string[];
    await Promise.all(sources.map((path) => {
      this.registerSource(denops, path, parse(path).name);
    }));
    await Promise.all(filters.map((path) => {
      this.registerFilter(denops, path, parse(path).name);
    }));
  }

  async onEvent(
    denops: Denops,
    context: Context,
    options: DdcOptions,
  ): Promise<void> {
    // Check invalid sources
    const invalidSources = this.foundInvalidSources(options.sources);
    if (invalidSources.length != 0) {
      await denops.call(
        "ddc#util#print_error",
        "Invalid sources are detected!",
      );
      await denops.call("ddc#util#print_error", invalidSources);
    }

    let filterNames: string[] = [];
    for (const source of this.foundSources(options.sources)) {
      const [sourceOptions, sourceParams] = sourceArgs(options, source);
      if (source.events?.includes(context.event)) {
        (source?.apiVersion)
          ? await source.onEvent({
            denops,
            context,
            options,
            sourceOptions,
            sourceParams,
          })
          : await source.onEvent(
            denops, // @ts-ignore: For deprecated sources
            context,
            options,
            sourceOptions,
            sourceParams,
          );
      }

      filterNames = filterNames.concat(
        sourceOptions.matchers,
        sourceOptions.sorters,
        sourceOptions.converters,
      );
    }

    // Uniq.
    filterNames = [...new Set(filterNames)];

    // Check invalid filters
    const invalidFilters = this.foundInvalidFilters(filterNames);
    if (invalidFilters.length != 0) {
      await denops.call(
        "ddc#util#print_error",
        "Invalid filters are detected!",
      );
      await denops.call("ddc#util#print_error", invalidFilters);
    }

    const filters = this.foundFilters(filterNames);

    for (const filter of filters) {
      if (filter.events?.includes(context.event)) {
        const [o, p] = filterArgs(
          options.filterOptions,
          options.filterParams,
          filter,
        );
        (filter.apiVersion)
          ? await filter.onEvent({
            denops,
            context,
            options,
            filterOptions: o,
            filterParams: p,
          })
          : await filter.onEvent(
            denops, // @ts-ignore: For deprecated filters
            context,
            options,
            o,
            p,
          );
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
      const pos = (s?.apiVersion)
        ? await s.getCompletePosition({
          denops,
          context,
          options,
          sourceOptions: o,
          sourceParams: p,
        })
        : await s.getCompletePosition(
          denops, // @ts-ignore: For deprecated sources
          context,
          options,
          o,
          p,
        );
      const forceCompletion = o.forceCompletionPattern.length != 0 &&
        context.input.search(
            new RegExp("(" + o.forceCompletionPattern + ")$"),
          ) != -1;
      // Note: If forceCompletion and not matched getCompletePosition(),
      // Use cursor position instead.
      const completePos = (pos < 0 && forceCompletion)
        ? context.input.length
        : (s.isBytePos && pos >= 0)
        ? byteposToCharpos(context.input, pos)
        : pos;
      const completeStr = context.input.slice(completePos);
      if (
        completePos < 0 ||
        (!forceCompletion &&
          context.event != "Manual" && context.event != "ManualRefresh" &&
          (completeStr.length < o.minAutoCompleteLength ||
            completeStr.length > o.maxAutoCompleteLength))
      ) {
        delete this.prevResults[s.name];
        return;
      }

      // Check previous result.
      const result = s.name in this.prevResults
        ? this.prevResults[s.name]
        : null;

      if (
        !result ||
        !completeStr.startsWith(result.completeStr) ||
        context.lineNr != result.lineNr ||
        context.event == "Manual" ||
        context.event == "AutoRefresh" ||
        context.event == "ManualRefresh" ||
        o.isVolatile
      ) {
        // Not matched.
        const scs = (s?.apiVersion)
          ? await s.gatherCandidates({
            denops,
            context,
            options,
            sourceOptions: o,
            sourceParams: p,
            completeStr,
          })
          : await s.gatherCandidates(
            denops, // @ts-ignore: For deprecated sources
            context,
            options,
            o,
            p,
            completeStr,
          );
        if (!scs.length) {
          return;
        }

        this.prevResults[s.name] = {
          candidates: scs.concat(),
          completeStr: completeStr,
          lineNr: context.lineNr,
        };
      }

      const fcs = await this.filterCandidates(
        denops,
        context,
        options,
        o,
        options.filterOptions,
        options.filterParams,
        completeStr,
        this.prevResults[s.name].candidates,
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

    async function callFilters(filters: BaseFilter[]): Promise<Candidate[]> {
      for (const filter of filters) {
        const [o, p] = filterArgs(filterOptions, filterParams, filter);
        cdd = (filter.apiVersion)
          ? await filter.filter({
            denops,
            context,
            options,
            sourceOptions,
            filterOptions: o,
            filterParams: p,
            completeStr,
            candidates: cdd,
          })
          : await filter.filter(
            denops, // @ts-ignore: For deprecated filters
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

    if (sourceOptions.matcherKey != "") {
      cdd = cdd.map((c) => (
        {
          ...c,
          // @ts-ignore: Convert matcherKey
          word: c[sourceOptions.matcherKey],
          __word: c.word,
        }
      ));
    }

    cdd = await callFilters(matchers);

    if (sourceOptions.matcherKey != "") {
      cdd = cdd.map((c) => (
        {
          ...c,
          // @ts-ignore: Restore matcherKey
          word: c.__word,
        }
      ));
    }

    cdd = await callFilters(sorters);

    // Filter by maxCandidates
    cdd = cdd.slice(0, sourceOptions.maxCandidates);

    cdd = await callFilters(converters);

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
      _args: GatherCandidatesArguments | Denops,
      _context?: Context,
      _options?: DdcOptions,
      _sourceOptions?: SourceOptions,
      _sourceParams?: Record<string, unknown>,
      _completeStr?: string,
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
      _args: FilterArguments | Denops,
      _context?: Context,
      _options?: DdcOptions,
      _sourceOptions?: SourceOptions,
      _filterOptions?: FilterOptions,
      _filterParams?: Record<string, unknown>,
      _completeStr?: string,
      _candidates?: Candidate[],
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
