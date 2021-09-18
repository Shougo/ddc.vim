import {
  Candidate,
  Context,
  DdcCandidate,
  DdcOptions,
  DdcUserData,
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
  deadline,
  DeadlineError,
  Denops,
  fn,
  op,
  parse,
  TimeoutError,
  toFileUrl,
} from "./deps.ts";

type DdcResult = {
  candidates: Candidate[];
  completeStr: string;
  prevInput: string;
  lineNr: number;
};

export class Ddc {
  private sources: Record<string, BaseSource> = {};
  private filters: Record<string, BaseFilter> = {};
  private aliasSources: Record<string, string> = {};
  private aliasFilters: Record<string, string> = {};
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
            `call ddc#_on_event("${event}")`,
          );
          this.events.push(event);
        }
      }
    });
  }

  registerAlias(type: string, alias: string, base: string) {
    if (type == "source") {
      this.aliasSources[alias] = base;
    } else if (type == "filter") {
      this.aliasFilters[alias] = base;
    }
  }

  async registerSource(denops: Denops, path: string, name: string) {
    if (path in this.checkPaths) {
      return;
    }

    this.checkPaths[path] = true;

    const mod = await import(toFileUrl(path).href);

    const addSource = (name: string) => {
      const source = new mod.Source();
      source.name = name;
      this.sources[source.name] = source;
      if (source.events && source.events.length != 0) {
        this.registerAutocmd(denops, source.events);
      }
    };

    addSource(name);

    // Check alias
    const aliases = Object.keys(this.aliasSources).filter(
      (k) => this.aliasSources[k] == name,
    );
    for (const alias of aliases) {
      addSource(alias);
    }
  }

  async registerFilter(denops: Denops, path: string, name: string) {
    if (path in this.checkPaths) {
      return;
    }

    this.checkPaths[path] = true;

    const mod = await import(toFileUrl(path).href);

    const addFilter = (name: string) => {
      const filter = new mod.Filter();
      filter.name = name;
      filter.onInit({ denops });
      this.filters[filter.name] = filter;
      if (filter.events && filter.events.length != 0) {
        this.registerAutocmd(denops, filter.events);
      }
    };

    addFilter(name);

    // Check alias
    const aliases = Object.keys(this.aliasFilters).filter(
      (k) => this.aliasFilters[k] == name,
    );
    for (const alias of aliases) {
      addFilter(alias);
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

  async checkInvalid(
    denops: Denops,
    options: DdcOptions,
    filterNames: string[],
  ) {
    // Check invalid sources
    const invalidSources = this.foundInvalidSources(options.sources);
    if (Object.keys(this.sources).length != 0 && invalidSources.length != 0) {
      await denops.call(
        "ddc#util#print_error",
        "Invalid sources are detected!",
      );
      await denops.call("ddc#util#print_error", invalidSources);
    }

    // Check invalid filters
    const invalidFilters = this.foundInvalidFilters([...new Set(filterNames)]);
    if (Object.keys(this.filters).length != 0 && invalidFilters.length != 0) {
      await denops.call(
        "ddc#util#print_error",
        "Invalid filters are detected!",
      );
      await denops.call("ddc#util#print_error", invalidFilters);
    }
  }

  async onEvent(
    denops: Denops,
    context: Context,
    options: DdcOptions,
  ): Promise<void> {
    let filterNames: string[] = [];
    for (const source of this.foundSources(options.sources)) {
      const [sourceOptions, sourceParams] = sourceArgs(options, source);
      if (source.events?.includes(context.event)) {
        await callSourceOnEvent(
          source,
          denops,
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

    for (const filter of this.foundFilters(filterNames)) {
      if (filter.events?.includes(context.event)) {
        const [o, p] = filterArgs(
          options.filterOptions,
          options.filterParams,
          filter,
        );
        await callFilterOnEvent(
          filter,
          denops,
          context,
          options,
          o,
          p,
        );
      }
    }

    if (
      context.event == "InsertLeave" &&
      Object.keys(this.sources).length != 0 &&
      Object.keys(this.filters).length != 0
    ) {
      await this.checkInvalid(denops, options, filterNames);
    }
  }

  async onCompleteDone(
    denops: Denops,
    context: Context,
    options: DdcOptions,
    userData: DdcUserData,
  ): Promise<void> {
    const source = this.sources[userData.__sourceName];
    if (!source || !source.onCompleteDone) {
      return;
    }

    const [sourceOptions, sourceParams] = sourceArgs(options, source);
    await callSourceOnCompleteDone(
      source,
      denops,
      context,
      options,
      sourceOptions,
      sourceParams,
      userData,
    );
  }

  async gatherResults(
    denops: Denops,
    context: Context,
    options: DdcOptions,
  ): Promise<[number, DdcCandidate[]]> {
    const sources = this.foundSources(options.sources)
      .map((s) => [s, ...sourceArgs(options, s)] as const);
    const rs = await Promise.all(sources.map(async ([s, o, p]) => {
      const pos = await callSourceGetCompletePosition(
        s,
        denops,
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

      const prevInput = context.input.slice(0, completePos);

      if (
        !result ||
        prevInput != result.prevInput ||
        !completeStr.startsWith(result.completeStr) ||
        context.lineNr != result.lineNr ||
        context.event == "Manual" ||
        context.event == "AutoRefresh" ||
        context.event == "ManualRefresh" ||
        o.isVolatile
      ) {
        // Not matched.
        const scs = await callSourceGatherCandidates(
          s,
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

        this.prevResults[s.name] = {
          candidates: scs.concat(),
          completeStr: completeStr,
          prevInput: prevInput,
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
          dup: o.dup,
          icase: true,
          equal: true,
          menu: formatMenu(o.mark, c.menu),
          user_data: Object.assign({ __sourceName: s.name }, c.user_data),
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
        cdd = await callFilterFilter(
          filter,
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

async function checkSourceOnInit(
  source: BaseSource,
  denops: Denops,
  sourceOptions: SourceOptions,
  sourceParams: Record<string, unknown>,
) {
  if (source.isInitialized) {
    return;
  }

  try {
    (source?.apiVersion)
      ? await source.onInit({
        denops,
        sourceOptions,
        sourceParams,
      })
      : await source.onInit( // @ts-ignore: For deprecated sources
        denops,
      );

    source.isInitialized = true;
  } catch (e: unknown) {
    if (e instanceof TimeoutError) {
      // Ignore timeout error
    } else {
      console.error(
        `[ddc.vim] source: ${source.name} "onInit()" is failed`,
      );
      console.error(e);
    }
  }
}

async function checkFilterOnInit(
  filter: BaseFilter,
  denops: Denops,
  filterOptions: FilterOptions,
  filterParams: Record<string, unknown>,
) {
  if (filter.isInitialized) {
    return;
  }

  try {
    await filter.onInit({
      denops,
      filterOptions,
      filterParams,
    });

    filter.isInitialized = true;
  } catch (e: unknown) {
    if (e instanceof TimeoutError) {
      // Ignore timeout error
    } else {
      console.error(
        `[ddc.vim] filter: ${filter.name} "onInit()" is failed`,
      );
      console.error(e);
    }
  }
}

async function callSourceOnEvent(
  source: BaseSource,
  denops: Denops,
  context: Context,
  options: DdcOptions,
  sourceOptions: SourceOptions,
  sourceParams: Record<string, unknown>,
) {
  await checkSourceOnInit(source, denops, sourceOptions, sourceParams);

  try {
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
  } catch (e: unknown) {
    if (e instanceof TimeoutError) {
      // Ignore timeout error
    } else {
      console.error(
        `[ddc.vim] source: ${source.name} "onEvent()" is failed`,
      );
      console.error(e);
    }
  }
}

async function callSourceOnCompleteDone(
  source: BaseSource,
  denops: Denops,
  context: Context,
  options: DdcOptions,
  sourceOptions: SourceOptions,
  sourceParams: Record<string, unknown>,
  userData: DdcUserData,
) {
  await checkSourceOnInit(source, denops, sourceOptions, sourceParams);

  try {
    await source.onCompleteDone({
      denops,
      context,
      options,
      sourceOptions,
      sourceParams,
      userData,
    });
  } catch (e: unknown) {
    if (e instanceof TimeoutError) {
      // Ignore timeout error
    } else {
      console.error(
        `[ddc.vim] source: ${source.name} "onCompleteDone()" is failed`,
      );
      console.error(e);
    }
  }
}

async function callSourceGetCompletePosition(
  source: BaseSource,
  denops: Denops,
  context: Context,
  options: DdcOptions,
  sourceOptions: SourceOptions,
  sourceParams: Record<string, unknown>,
): Promise<number> {
  await checkSourceOnInit(source, denops, sourceOptions, sourceParams);

  try {
    return (source?.apiVersion)
      ? await source.getCompletePosition({
        denops,
        context,
        options,
        sourceOptions,
        sourceParams,
      })
      : await source.getCompletePosition(
        denops, // @ts-ignore: For deprecated sources
        context,
        options,
        sourceOptions,
        sourceParams,
      );
  } catch (e: unknown) {
    if (e instanceof TimeoutError) {
      // Ignore timeout error
    } else {
      console.error(
        `[ddc.vim] source: ${source.name} "getCompletePoistion()" is failed`,
      );
      console.error(e);
    }

    return -1;
  }
}

async function callSourceGatherCandidates(
  source: BaseSource,
  denops: Denops,
  context: Context,
  options: DdcOptions,
  sourceOptions: SourceOptions,
  sourceParams: Record<string, unknown>,
  completeStr: string,
): Promise<Candidate[]> {
  await checkSourceOnInit(source, denops, sourceOptions, sourceParams);

  try {
    const promise = (source?.apiVersion)
      ? source.gatherCandidates({
        denops,
        context,
        options,
        sourceOptions,
        sourceParams,
        completeStr,
      })
      : source.gatherCandidates(
        denops, // @ts-ignore: For deprecated sources
        context,
        options,
        sourceOptions,
        sourceParams,
        completeStr,
      );
    return await deadline(promise, sourceOptions.timeout);
  } catch (e: unknown) {
    if (e instanceof TimeoutError || e instanceof DeadlineError) {
      // Ignore timeout error
    } else {
      console.error(
        `[ddc.vim] source: ${source.name} "gatherCandidates()" is failed`,
      );
      console.error(e);
    }

    return [];
  }
}

async function callFilterOnEvent(
  filter: BaseFilter,
  denops: Denops,
  context: Context,
  options: DdcOptions,
  filterOptions: FilterOptions,
  filterParams: Record<string, unknown>,
) {
  await checkFilterOnInit(filter, denops, filterOptions, filterParams);

  try {
    filter.onEvent({
      denops,
      context,
      options,
      filterOptions,
      filterParams,
    });
  } catch (e: unknown) {
    if (e instanceof TimeoutError) {
      // Ignore timeout error
    } else {
      console.error(
        `[ddc.vim] filter: ${filter.name} "onEvent()" is failed`,
      );
      console.error(e);
    }
  }
}

async function callFilterFilter(
  filter: BaseFilter,
  denops: Denops,
  context: Context,
  options: DdcOptions,
  sourceOptions: SourceOptions,
  filterOptions: FilterOptions,
  filterParams: Record<string, unknown>,
  completeStr: string,
  candidates: Candidate[],
): Promise<Candidate[]> {
  await checkFilterOnInit(filter, denops, filterOptions, filterParams);

  try {
    return await filter.filter({
      denops,
      context,
      options,
      sourceOptions,
      filterOptions,
      filterParams,
      completeStr,
      candidates,
    });
  } catch (e: unknown) {
    if (e instanceof TimeoutError) {
      // Ignore timeout error
    } else {
      console.error(
        `[ddc.vim] filter: ${filter.name} "filter()" is failed`,
      );
      console.error(e);
    }

    return [];
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
