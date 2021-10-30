import {
  Candidate,
  Context,
  DdcCandidate,
  DdcOptions,
  DdcUserData,
  FilterOptions,
  OnCallback,
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
import { isDdcCallbackCancelError } from "./callback.ts";
import {
  assertEquals,
  autocmd,
  base64,
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
  private sources: Record<string, BaseSource<Record<string, unknown>>> = {};
  private filters: Record<string, BaseFilter<Record<string, unknown>>> = {};
  private aliasSources: Record<string, string> = {};
  private aliasFilters: Record<string, string> = {};
  private checkPaths: Record<string, boolean> = {};
  private prevResults: Record<string, DdcResult> = {};
  private events: string[] = [];
  // deno-lint-ignore no-explicit-any
  private mods: Record<string, any> = {};

  private foundSources(names: string[]): BaseSource<Record<string, unknown>>[] {
    return names.map((n) => this.sources[n]).filter((v) => v);
  }
  private foundFilters(names: string[]): BaseFilter<Record<string, unknown>>[] {
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
    this.checkPaths[path] = true;

    const mod = this.mods[toFileUrl(path).href] ??
      await import(toFileUrl(path).href);

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
    this.checkPaths[path] = true;

    const mod = this.mods[toFileUrl(path).href] ??
      await import(toFileUrl(path).href);

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

  async autoload(denops: Denops, sourceNames: string[], filterNames: string[]) {
    if (sourceNames.length == 0 && filterNames.length == 0) {
      return;
    }

    const runtimepath = await op.runtimepath.getGlobal(denops);

    async function globpath(
      searches: string[],
      files: string[],
    ): Promise<string[]> {
      let paths: string[] = [];
      for (const search of searches) {
        for (const file of files) {
          paths = paths.concat(
            await fn.globpath(
              denops,
              runtimepath,
              search + file + ".ts",
              1,
              1,
            ) as string[],
          );
        }
      }

      return Promise.resolve(paths);
    }

    const sources = (await globpath(
      ["denops/@ddc-sources/", "denops/ddc-sources/"],
      sourceNames.map((file) => this.aliasSources[file] ?? file),
    )).filter((path) => !(path in this.checkPaths));

    const filters = (await globpath(
      ["denops/@ddc-filters/", "denops/ddc-filters/"],
      filterNames.map((file) => this.aliasFilters[file] ?? file),
    )).filter((path) => !(path in this.checkPaths));

    this.mods = {
      ...this.mods,
      ...(await import(
        "data:charset=utf-8;base64," +
          base64.encode([
            ...[...sources, ...filters].map((path, i) =>
              `import * as mod${i} from ${JSON.stringify(toFileUrl(path).href)}`
            ),
            `export const mods={`,
            ...[...sources, ...filters].map((path, i) =>
              `${JSON.stringify(toFileUrl(path).href)}:mod${i},`
            ),
            `}`,
          ].join("\n"))
      )).mods,
    };

    await Promise.all(sources.map(async (path) => {
      await this.registerSource(denops, path, parse(path).name);
    }));
    await Promise.all(filters.map(async (path) => {
      await this.registerFilter(denops, path, parse(path).name);
    }));
  }

  async checkInvalid(
    denops: Denops,
    sourceNames: string[],
    filterNames: string[],
  ) {
    // Auto load invalid sources
    const beforeSources = this.foundInvalidSources(sourceNames);
    const beforeFilters = this.foundInvalidFilters([...new Set(filterNames)]);
    await this.autoload(denops, beforeSources, beforeFilters);

    // Check invalid sources
    const invalidSources = this.foundInvalidSources(sourceNames);
    if (beforeSources == invalidSources && invalidSources.length != 0) {
      await denops.call(
        "ddc#util#print_error",
        "Invalid sources are detected!",
      );
      await denops.call("ddc#util#print_error", invalidSources);
    }

    // Check invalid filters
    const invalidFilters = this.foundInvalidFilters([...new Set(filterNames)]);
    if (beforeFilters == invalidFilters && invalidFilters.length != 0) {
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
    onCallback: OnCallback,
    options: DdcOptions,
  ): Promise<void> {
    let filterNames: string[] = [];
    for (const sourceName of options.sources) {
      const o = foldMerge(
        mergeSourceOptions,
        defaultSourceOptions,
        [options.sourceOptions["_"], options.sourceOptions[sourceName]],
      );

      filterNames = filterNames.concat(
        o.matchers,
        o.sorters,
        o.converters,
      );
    }
    await this.checkInvalid(denops, options.sources, filterNames);

    for (const source of this.foundSources(options.sources)) {
      const [sourceOptions, sourceParams] = sourceArgs(options, source);
      if (source.events?.includes(context.event)) {
        await callSourceOnEvent(
          source,
          denops,
          context,
          onCallback,
          options,
          sourceOptions,
          sourceParams,
        );
      }
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
          onCallback,
          options,
          o,
          p,
        );
      }
    }
  }

  async onCompleteDone(
    denops: Denops,
    context: Context,
    onCallback: OnCallback,
    options: DdcOptions,
    sourceName: string,
    userData: DdcUserData,
  ): Promise<void> {
    const source = this.sources[sourceName];
    if (!source || !source.onCompleteDone) {
      return;
    }

    const [sourceOptions, sourceParams] = sourceArgs(options, source);
    await callSourceOnCompleteDone(
      source,
      denops,
      context,
      onCallback,
      options,
      sourceOptions,
      sourceParams,
      userData,
    );
  }

  async gatherResults(
    denops: Denops,
    context: Context,
    onCallback: OnCallback,
    options: DdcOptions,
  ): Promise<[number, DdcCandidate[]]> {
    const sources = this.foundSources(options.sources)
      .map((s) => [s, ...sourceArgs(options, s)] as const);
    const rs = await Promise.all(sources.map(async ([s, o, p]) => {
      const pos = await callSourceGetCompletePosition(
        s,
        denops,
        context,
        onCallback,
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
          onCallback,
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
        onCallback,
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
          __sourceName: s.name,
          abbr: formatAbbr(c.word, c.abbr),
          dup: o.dup,
          equal: true,
          icase: true,
          kind: c.kind ? c.kind : "",
          info: c.info ? c.info : "",
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
    const candidates = fs.flatMap(([pos, candidates]) =>
      candidates.map((c) => {
        // Note: Merge word by completePos
        const word = context.input.substring(completePos, pos) + c.word;
        return {
          ...c,
          word: word,
          abbr: c.word == c.abbr ? word : c.abbr,
        };
      })
    );

    // Convert2byte for Vim
    const completePosBytes = charposToBytepos(context.input, completePos);

    return [completePosBytes, candidates];
  }

  private async filterCandidates(
    denops: Denops,
    context: Context,
    onCallback: OnCallback,
    options: DdcOptions,
    sourceOptions: SourceOptions,
    filterOptions: Record<string, Partial<FilterOptions>>,
    filterParams: Record<string, Partial<Record<string, unknown>>>,
    completeStr: string,
    cdd: Candidate[],
  ): Promise<Candidate[]> {
    // Check invalid
    const invalidFilters = this.foundInvalidFilters(
      sourceOptions.matchers.concat(
        sourceOptions.sorters,
      ).concat(
        sourceOptions.converters,
      ),
    );
    if (invalidFilters.length != 0) {
      return [];
    }

    const matchers = this.foundFilters(sourceOptions.matchers);
    const sorters = this.foundFilters(sourceOptions.sorters);
    const converters = this.foundFilters(sourceOptions.converters);

    async function callFilters(
      filters: BaseFilter<Record<string, unknown>>[],
    ): Promise<Candidate[]> {
      for (const filter of filters) {
        const [o, p] = filterArgs(filterOptions, filterParams, filter);
        cdd = await callFilterFilter(
          filter,
          denops,
          context,
          onCallback,
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

// isinstanceof may be failed
// https://zenn.dev/luma/articles/2e891a24fe099c
function isTimeoutError(e: unknown): e is TimeoutError {
  return (e as TimeoutError).name == "TimeoutError";
}

function sourceArgs<
  Params extends Record<string, unknown>,
  UserData extends unknown,
>(
  options: DdcOptions,
  source: BaseSource<Params, UserData>,
): [SourceOptions, Record<string, unknown>] {
  const o = foldMerge(
    mergeSourceOptions,
    defaultSourceOptions,
    [options.sourceOptions["_"], options.sourceOptions[source.name]],
  );
  const p = foldMerge(mergeSourceParams, defaultSourceParams, [
    source.params ? source.params() : null,
    options.sourceParams[source.name],
  ]);
  return [o, p];
}

function filterArgs<
  Params extends Record<string, unknown>,
>(
  filterOptions: Record<string, Partial<FilterOptions>>,
  filterParams: Record<string, Partial<Record<string, unknown>>>,
  filter: BaseFilter<Params>,
): [FilterOptions, Record<string, unknown>] {
  // TODO: '_'?
  const optionsOf = (filter: BaseFilter<Record<string, unknown>>) =>
    foldMerge(mergeFilterOptions, defaultFilterOptions, [
      filterOptions[filter.name],
    ]);
  const paramsOf = (filter: BaseFilter<Record<string, unknown>>) =>
    foldMerge(mergeFilterParams, defaultFilterParams, [
      filter.params(),
      filterParams[filter.name],
    ]);
  return [optionsOf(filter), paramsOf(filter)];
}

async function checkSourceOnInit(
  source: BaseSource<Record<string, unknown>>,
  denops: Denops,
  sourceOptions: SourceOptions,
  sourceParams: Record<string, unknown>,
) {
  if (source.isInitialized) {
    return;
  }

  try {
    await source.onInit({
      denops,
      sourceOptions,
      sourceParams,
    });

    source.isInitialized = true;
  } catch (e: unknown) {
    if (isTimeoutError(e)) {
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
  filter: BaseFilter<Record<string, unknown>>,
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
    if (isTimeoutError(e)) {
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
  source: BaseSource<Record<string, unknown>>,
  denops: Denops,
  context: Context,
  onCallback: OnCallback,
  options: DdcOptions,
  sourceOptions: SourceOptions,
  sourceParams: Record<string, unknown>,
) {
  await checkSourceOnInit(source, denops, sourceOptions, sourceParams);

  try {
    await source.onEvent({
      denops,
      context,
      onCallback,
      options,
      sourceOptions,
      sourceParams,
    });
  } catch (e: unknown) {
    if (isTimeoutError(e) || isDdcCallbackCancelError(e)) {
      // Ignore timeout error
    } else {
      console.error(
        `[ddc.vim] source: ${source.name} "onEvent()" is failed`,
      );
      console.error(e);
    }
  }
}

async function callSourceOnCompleteDone<
  Params extends Record<string, unknown>,
  UserData extends unknown,
>(
  source: BaseSource<Params, UserData>,
  denops: Denops,
  context: Context,
  onCallback: OnCallback,
  options: DdcOptions,
  sourceOptions: SourceOptions,
  sourceParams: Params,
  userData: UserData,
) {
  await checkSourceOnInit(source, denops, sourceOptions, sourceParams);

  try {
    await source.onCompleteDone({
      denops,
      context,
      onCallback,
      options,
      sourceOptions,
      sourceParams,
      // This is preventing users from accessing the internal properties.
      // deno-lint-ignore no-explicit-any
      userData: userData as any,
    });
  } catch (e: unknown) {
    if (isTimeoutError(e) || isDdcCallbackCancelError(e)) {
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
  source: BaseSource<Record<string, unknown>>,
  denops: Denops,
  context: Context,
  onCallback: OnCallback,
  options: DdcOptions,
  sourceOptions: SourceOptions,
  sourceParams: Record<string, unknown>,
): Promise<number> {
  await checkSourceOnInit(source, denops, sourceOptions, sourceParams);

  try {
    return await source.getCompletePosition({
      denops,
      context,
      onCallback,
      options,
      sourceOptions,
      sourceParams,
    });
  } catch (e: unknown) {
    if (isTimeoutError(e) || isDdcCallbackCancelError(e)) {
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

async function callSourceGatherCandidates<
  Params extends Record<string, unknown>,
  UserData extends unknown,
>(
  source: BaseSource<Params, UserData>,
  denops: Denops,
  context: Context,
  onCallback: OnCallback,
  options: DdcOptions,
  sourceOptions: SourceOptions,
  sourceParams: Params,
  completeStr: string,
): Promise<Candidate<UserData>[]> {
  await checkSourceOnInit(source, denops, sourceOptions, sourceParams);

  try {
    const promise = source.gatherCandidates({
      denops,
      context,
      onCallback,
      options,
      sourceOptions,
      sourceParams,
      completeStr,
    });
    return await deadline(promise, sourceOptions.timeout);
  } catch (e: unknown) {
    if (
      isTimeoutError(e) || isDdcCallbackCancelError(e) ||
      e instanceof DeadlineError
    ) {
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
  filter: BaseFilter<Record<string, unknown>>,
  denops: Denops,
  context: Context,
  onCallback: OnCallback,
  options: DdcOptions,
  filterOptions: FilterOptions,
  filterParams: Record<string, unknown>,
) {
  await checkFilterOnInit(filter, denops, filterOptions, filterParams);

  try {
    await filter.onEvent({
      denops,
      context,
      onCallback,
      options,
      filterOptions,
      filterParams,
    });
  } catch (e: unknown) {
    if (isTimeoutError(e) || isDdcCallbackCancelError(e)) {
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
  filter: BaseFilter<Record<string, unknown>>,
  denops: Denops,
  context: Context,
  onCallback: OnCallback,
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
      onCallback,
      options,
      sourceOptions,
      filterOptions,
      filterParams,
      completeStr,
      candidates,
    });
  } catch (e: unknown) {
    if (isTimeoutError(e) || isDdcCallbackCancelError(e)) {
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
  class S extends BaseSource<{ min: number; max: number }> {
    params() {
      return {
        "min": 0,
        "max": 999,
      };
    }
    gatherCandidates(
      _args: GatherCandidatesArguments<{ min: number; max: number }> | Denops,
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
  class F extends BaseFilter<{ min: number; max: number }> {
    params() {
      return {
        "min": 0,
        "max": 999,
      };
    }
    filter(
      _args: FilterArguments<{ min: number; max: number }> | Denops,
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
