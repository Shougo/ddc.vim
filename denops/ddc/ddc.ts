import {
  BaseFilterParams,
  BaseSourceParams,
  BaseUiParams,
  Context,
  DdcExtType,
  DdcGatherItems,
  DdcItem,
  DdcOptions,
  DdcUserData,
  FilterOptions,
  Item,
  OnCallback,
  SourceOptions,
  UiOptions,
} from "./types.ts";
import {
  defaultDdcOptions,
  defaultDummy,
  foldMerge,
  mergeFilterOptions,
  mergeFilterParams,
  mergeSourceOptions,
  mergeSourceParams,
  mergeUiOptions,
  mergeUiParams,
} from "./context.ts";
import { BaseUi, defaultUiOptions } from "./base/ui.ts";
import {
  BaseSource,
  defaultSourceOptions,
  GatherArguments,
} from "./base/source.ts";
import {
  BaseFilter,
  defaultFilterOptions,
  FilterArguments,
} from "./base/filter.ts";
import { isDdcCallbackCancelError } from "./callback.ts";
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
  items: Item[];
  completeStr: string;
  prevInput: string;
  lineNr: number;
  isIncomplete: boolean;
};

export class Ddc {
  private uis: Record<string, BaseUi<BaseUiParams>> = {};
  private sources: Record<string, BaseSource<BaseSourceParams>> = {};
  private filters: Record<string, BaseFilter<BaseFilterParams>> = {};

  private aliases: Record<DdcExtType, Record<string, string>> = {
    ui: {},
    source: {},
    filter: {},
  };

  private checkPaths: Record<string, boolean> = {};
  private prevResults: Record<string, DdcResult> = {};
  private events: string[] = [];

  private visibleUi = false;
  prevSources: string[] = [];
  prevUi = "";

  private foundSources(names: string[]): BaseSource<BaseSourceParams>[] {
    return names.map((n) => this.sources[n]).filter((v) => v);
  }
  private foundFilters(names: string[]): BaseFilter<BaseFilterParams>[] {
    return names.map((n) => this.filters[n]).filter((v) => v);
  }

  private foundInvalidSources(names: string[]): string[] {
    return names.filter((n) =>
      !this.sources[n] ||
      this.sources[n].apiVersion < 4
    );
  }
  private foundInvalidFilters(names: string[]): string[] {
    return names.filter((n) =>
      !this.filters[n] ||
      this.filters[n].apiVersion < 4
    );
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

  registerAlias(type: DdcExtType, alias: string, base: string) {
    this.aliases[type][alias] = base;
  }

  async register(type: DdcExtType, path: string, name: string) {
    if (path in this.checkPaths) {
      return;
    }
    this.checkPaths[path] = true;

    const mod = await import(toFileUrl(path).href);

    let add;
    switch (type) {
      case "ui":
        add = (name: string) => {
          const ui = new mod.Ui();
          ui.name = name;
          this.uis[ui.name] = ui;
        };
        break;
      case "source":
        add = (name: string) => {
          const source = new mod.Source();
          source.name = name;
          this.sources[source.name] = source;
        };
        break;
      case "filter":
        add = (name: string) => {
          const filter = new mod.Filter();
          filter.name = name;
          this.filters[filter.name] = filter;
        };
        break;
    }

    add(name);

    // Check alias
    const aliases = Object.keys(this.aliases[type]).filter(
      (k) => this.aliases[type][k] === name,
    );
    for (const alias of aliases) {
      add(alias);
    }
  }

  async autoload(
    denops: Denops,
    type: DdcExtType,
    names: string[],
  ): Promise<string[]> {
    if (names.length === 0) {
      return [];
    }

    const paths = await globpath(
      denops,
      [`denops/@ddc-${type}s/`],
      names.map((file) => this.aliases[type][file] ?? file),
    );

    await Promise.all(paths.map(async (path) => {
      await this.register(type, path, parse(path).name);
    }));

    return paths;
  }

  async checkInvalid(
    denops: Denops,
    sourceNames: string[],
    filterNames: string[],
  ) {
    const loadedSources = await this.autoload(
      denops,
      "source",
      this.foundInvalidSources(sourceNames),
    );
    const loadedFilters = await this.autoload(
      denops,
      "filter",
      this.foundInvalidFilters([...new Set(filterNames)]),
    );

    if (loadedSources.length !== 0 && loadedFilters.length !== 0) {
      return;
    }

    const invalidSources = this.foundInvalidSources(sourceNames);
    if (invalidSources.length > 0) {
      await denops.call(
        "ddc#util#print_error",
        "Sources not found or don't support the ddc version: " +
          invalidSources.toString(),
      );
      for (const name in invalidSources) {
        delete this.sources[name];
      }
    }

    const invalidFilters = this.foundInvalidFilters([...new Set(filterNames)]);
    if (invalidFilters.length > 0) {
      await denops.call(
        "ddc#util#print_error",
        "Filters not found or don't support the ddc version: " +
          invalidFilters.toString(),
      );
      for (const name in invalidFilters) {
        delete this.filters[name];
      }
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
    // Uniq.
    filterNames = [...new Set(filterNames.concat(options.postFilters))];

    await this.checkInvalid(
      denops,
      options.sources,
      filterNames,
    );

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
  ): Promise<[number, DdcItem[]]> {
    const sources = this.foundSources(options.sources)
      .map((s) => [s, ...sourceArgs(options, s)] as const);
    this.prevSources = options.sources;

    const rs = await Promise.all(sources.map(async ([s, o, p]) => {
      // Check enabled
      if (o.enabledIf !== "" && !(await denops.call("eval", o.enabledIf))) {
        return;
      }

      const pos = await callSourceGetCompletePosition(
        s,
        denops,
        context,
        onCallback,
        options,
        o,
        p,
      );
      const forceCompletion = o.forceCompletionPattern.length !== 0 &&
        context.input.search(
            new RegExp("(?:" + o.forceCompletionPattern + ")$"),
          ) !== -1;
      // Note: If forceCompletion and not matched getCompletePosition(),
      // Use cursor position instead.
      const completePos = (pos < 0 && forceCompletion)
        ? context.input.length
        : (s.isBytePos && pos >= 0)
        ? byteposToCharpos(context.input, pos)
        : pos;
      const completeStr = context.input.slice(completePos);
      const incomplete = this.prevResults[s.name]?.isIncomplete ?? false;
      const triggerForIncomplete = !forceCompletion && incomplete &&
        context.lineNr === this.prevResults[s.name].lineNr;
      if (
        completePos < 0 ||
        (!forceCompletion &&
          (context.event !== "Manual" && context.event !== "Update") &&
          (completeStr.length < o.minAutoCompleteLength ||
            completeStr.length > o.maxAutoCompleteLength))
      ) {
        delete this.prevResults[s.name];
        return;
      }

      // Check previous result.
      const checkPrevResult = s.name in this.prevResults
        ? this.prevResults[s.name]
        : null;

      const prevInput = context.input.slice(0, completePos);

      if (
        !checkPrevResult || triggerForIncomplete ||
        prevInput !== checkPrevResult.prevInput ||
        !completeStr.startsWith(checkPrevResult.completeStr) ||
        context.lineNr !== checkPrevResult.lineNr ||
        context.event === "Manual" ||
        (o.isVolatile && context.event !== "Update")
      ) {
        // Not matched.
        const result = await callSourceGather(
          s,
          denops,
          context,
          onCallback,
          options,
          o,
          p,
          completePos,
          completeStr,
          triggerForIncomplete,
        );

        let items: Item[];
        let isIncomplete: boolean;
        if ("isIncomplete" in result) {
          // DdcGatherItems
          items = result.items.concat();
          isIncomplete = result.isIncomplete;
        } else {
          // Item[]
          items = result.concat();
          isIncomplete = false;
        }

        this.prevResults[s.name] = {
          items,
          completeStr,
          prevInput,
          lineNr: context.lineNr,
          isIncomplete,
        };
      }

      const prevResult = this.prevResults[s.name];

      const fis = await this.filterItems(
        denops,
        context,
        onCallback,
        options,
        o,
        options.filterOptions,
        options.filterParams,
        completeStr,
        prevResult.items,
      );

      // Cache filtered result
      prevResult.completeStr = completeStr;
      prevResult.items = fis;

      const items = fis.map((c) => (
        {
          ...c,
          __sourceName: s.name,
          __dup: o.dup,
          abbr: formatAbbr(c.word, c.abbr),
          dup: true,
          equal: true,
          icase: true,
          kind: c.kind ? c.kind : "",
          info: c.info ? c.info : "",
          menu: formatMenu(o.mark, c.menu),
        }
      ));
      if (!items.length) {
        return;
      }

      return [completePos, items] as const;
    }));

    // Remove invalid source
    const fs = rs.filter(<T>(v?: T): v is T => !!v);
    if (!fs.length) {
      return [-1, []];
    }

    const completePos = Math.min(...fs.map((v) => v[0]));

    // Flatten items
    const items = fs.flatMap(([pos, items]) =>
      items.map((c) => {
        // Note: Merge word by completePos
        const word = context.input.substring(completePos, pos) + c.word;

        return {
          ...c,
          word: word,
          abbr: c.word === c.abbr ? word : c.abbr,
        };
      })
    );

    const seen = new Set();
    let retItems: DdcItem[] = [];
    for (const item of items) {
      // Remove emtpy items
      if (item.word === "") {
        continue;
      }

      if (seen.has(item.word)) {
        if (item.__dup === "force") {
          // Force overwrite duplicated words
          retItems = retItems.filter((c) => c.word !== item.word);
        } else if (item.__dup === "ignore") {
          // Ignore duplicated words
          continue;
        } else {
          // Keep duplicated words
        }
      }

      seen.add(item.word);
      retItems.push(item);
    }

    // Post filters
    for (const filter of this.foundFilters(options.postFilters)) {
      const [o, p] = filterArgs(
        options.filterOptions,
        options.filterParams,
        filter,
      );

      // @ts-ignore: postFilters does not change items keys
      retItems = await callFilterFilter(
        filter,
        denops,
        context,
        onCallback,
        options,
        defaultSourceOptions(),
        o,
        p,
        context.input.slice(completePos),
        retItems,
      );
    }

    // Convert2byte for Vim
    const completePosBytes = charposToBytepos(context.input, completePos);

    return [completePosBytes, retItems];
  }
  updateItems(
    name: string,
    items: Item[],
  ) {
    const result = name in this.prevResults ? this.prevResults[name] : null;
    if (!result) {
      return;
    }

    result.items = items;
    result.isIncomplete = false;
  }

  async skipCompletion(
    denops: Denops,
    context: Context,
    options: DdcOptions,
  ): Promise<boolean> {
    const [ui, uiOptions, uiParams] = await this.getUi(denops, options);
    if (!ui) {
      return true;
    }

    return await ui.skipCompletion({
      denops,
      context,
      options,
      uiOptions,
      uiParams,
    });
  }

  async show(
    denops: Denops,
    context: Context,
    options: DdcOptions,
    completePos: number,
    items: DdcItem[],
  ) {
    const skip = await denops.call(
      "ddc#complete#_skip",
      completePos,
      items,
    );
    if (skip) {
      return;
    }

    const [ui, uiOptions, uiParams] = await this.getUi(denops, options);
    if (!ui) {
      return;
    }

    await ui.show({
      denops,
      context,
      options,
      completePos,
      items,
      uiOptions,
      uiParams,
    });

    this.prevUi = options.ui;
    this.visibleUi = true;
  }

  async hide(
    denops: Denops,
    context: Context,
    options: DdcOptions,
  ) {
    const [ui, uiOptions, uiParams] = await this.getUi(denops, options);
    if (!ui) {
      return;
    }

    await ui.hide({
      denops,
      context,
      options,
      uiOptions,
      uiParams,
    });
    this.visibleUi = false;
  }

  async visible(
    denops: Denops,
    context: Context,
    options: DdcOptions,
  ): Promise<boolean> {
    const [ui, uiOptions, uiParams] = await this.getUi(denops, options);
    if (!ui) {
      return false;
    }

    if (this.visibleUi) {
      return true;
    }

    // Check UI is visible
    // NOTE: UI may be closed by users
    return ui.visible
      ? ui.visible({
        denops,
        context,
        options,
        uiOptions,
        uiParams,
      })
      : true;
  }

  private async filterItems(
    denops: Denops,
    context: Context,
    onCallback: OnCallback,
    options: DdcOptions,
    sourceOptions: SourceOptions,
    filterOptions: Record<string, Partial<FilterOptions>>,
    filterParams: Record<string, Partial<BaseFilterParams>>,
    completeStr: string,
    cdd: Item[],
  ): Promise<Item[]> {
    // Check invalid
    const invalidFilters = this.foundInvalidFilters(
      options.postFilters.concat(
        sourceOptions.matchers,
      ).concat(
        sourceOptions.sorters,
      ).concat(
        sourceOptions.converters,
      ),
    );
    if (invalidFilters.length !== 0) {
      return [];
    }

    const matchers = this.foundFilters(sourceOptions.matchers);
    const sorters = this.foundFilters(sourceOptions.sorters);
    const converters = this.foundFilters(sourceOptions.converters);

    async function callFilters(
      filters: BaseFilter<BaseFilterParams>[],
    ): Promise<Item[]> {
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

    if (sourceOptions.maxKeywordLength > 0) {
      cdd = cdd.filter((item: Item) =>
        item.word.length <= sourceOptions.maxKeywordLength
      );
    }

    if (sourceOptions.minKeywordLength > 0) {
      cdd = cdd.filter((item: Item) =>
        item.word.length >= sourceOptions.minKeywordLength
      );
    }

    if (sourceOptions.matcherKey !== "") {
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

    if (sourceOptions.matcherKey !== "") {
      cdd = cdd.map((c) => (
        {
          ...c,
          // @ts-ignore: Restore matcherKey
          word: c.__word,
        }
      ));
    }

    cdd = await callFilters(sorters);

    // Filter by maxItems
    cdd = cdd.slice(0, sourceOptions.maxItems);

    cdd = await callFilters(converters);

    return cdd;
  }

  private async getUi(
    denops: Denops,
    options: DdcOptions,
  ): Promise<
    [
      BaseUi<BaseUiParams> | undefined,
      UiOptions,
      BaseUiParams,
    ]
  > {
    if (options.ui.length === 0) {
      await denops.call(
        "ddc#util#print_error",
        'You must install ddc UI plugins and specify "ui" option.',
      );

      return [
        undefined,
        defaultUiOptions(),
        defaultDummy(),
      ];
    }

    if (!this.uis[options.ui]) {
      await this.autoload(denops, "ui", [options.ui]);
    }
    const ui = this.uis[options.ui];
    if (!ui) {
      await denops.call(
        "ddc#util#print_error",
        `Not found ui: "${options.ui}"`,
      );
      return [
        undefined,
        defaultUiOptions(),
        defaultDummy(),
      ];
    }

    const [uiOptions, uiParams] = uiArgs(options, ui);
    await checkUiOnInit(ui, denops, uiOptions, uiParams);

    return [ui, uiOptions, uiParams];
  }
}

function formatAbbr(word: string, abbr: string | undefined): string {
  return abbr ? abbr : word;
}

function formatMenu(prefix: string, menu: string | undefined): string {
  menu = menu ?? "";
  return prefix === "" ? menu : menu === "" ? prefix : `${prefix} ${menu}`;
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
  return (e as TimeoutError).name === "TimeoutError";
}

function uiArgs<Params extends BaseUiParams>(
  options: DdcOptions,
  ui: BaseUi<Params>,
): [UiOptions, BaseUiParams] {
  const o = foldMerge(
    mergeUiOptions,
    defaultUiOptions,
    [options.uiOptions["_"], options.uiOptions[ui.name]],
  );
  const p = foldMerge(mergeUiParams, defaultDummy, [
    ui.params ? ui.params() : null,
    options.uiParams[ui.name],
  ]);
  return [o, p];
}

function sourceArgs<
  Params extends BaseSourceParams,
  UserData extends unknown,
>(
  options: DdcOptions,
  source: BaseSource<Params, UserData>,
): [SourceOptions, BaseSourceParams] {
  const o = foldMerge(
    mergeSourceOptions,
    defaultSourceOptions,
    [options.sourceOptions["_"], options.sourceOptions[source.name]],
  );
  const p = foldMerge(mergeSourceParams, defaultDummy, [
    source.params ? source.params() : null,
    options.sourceParams[source.name],
  ]);
  return [o, p];
}

function filterArgs<
  Params extends BaseFilterParams,
>(
  filterOptions: Record<string, Partial<FilterOptions>>,
  filterParams: Record<string, Partial<BaseFilterParams>>,
  filter: BaseFilter<Params>,
): [FilterOptions, BaseFilterParams] {
  // TODO: '_'?
  const optionsOf = (filter: BaseFilter<BaseFilterParams>) =>
    foldMerge(mergeFilterOptions, defaultFilterOptions, [
      filterOptions[filter.name],
    ]);
  const paramsOf = (filter: BaseFilter<BaseFilterParams>) =>
    foldMerge(mergeFilterParams, defaultDummy, [
      filter.params(),
      filterParams[filter.name],
    ]);
  return [optionsOf(filter), paramsOf(filter)];
}

async function checkUiOnInit(
  ui: BaseUi<BaseUiParams>,
  denops: Denops,
  uiOptions: UiOptions,
  uiParams: BaseUiParams,
) {
  if (ui.isInitialized) {
    return;
  }

  try {
    await ui.onInit({
      denops,
      uiOptions,
      uiParams,
    });

    ui.isInitialized = true;
  } catch (e: unknown) {
    if (isTimeoutError(e)) {
      // Ignore timeout error
    } else {
      await errorException(
        denops,
        e,
        `ui: ${ui.name} "onInit()" failed`,
      );
    }
  }
}

async function checkSourceOnInit(
  source: BaseSource<BaseSourceParams>,
  denops: Denops,
  sourceOptions: SourceOptions,
  sourceParams: BaseSourceParams,
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
      await errorException(
        denops,
        e,
        `source: ${source.name} "onInit()" failed`,
      );
    }
  }
}

async function checkFilterOnInit(
  filter: BaseFilter<BaseFilterParams>,
  denops: Denops,
  filterOptions: FilterOptions,
  filterParams: BaseFilterParams,
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
      await errorException(
        denops,
        e,
        `filter: ${filter.name} "onInit()" failed`,
      );
    }
  }
}

async function callSourceOnEvent(
  source: BaseSource<BaseSourceParams>,
  denops: Denops,
  context: Context,
  onCallback: OnCallback,
  options: DdcOptions,
  sourceOptions: SourceOptions,
  sourceParams: BaseSourceParams,
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
      await errorException(
        denops,
        e,
        `source: ${source.name} "onEvent()" failed`,
      );
    }
  }
}

async function callSourceOnCompleteDone<
  Params extends BaseSourceParams,
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
      await errorException(
        denops,
        e,
        `source: ${source.name} "onCompleteDone()" failed`,
      );
    }
  }
}

async function callSourceGetCompletePosition(
  source: BaseSource<BaseSourceParams>,
  denops: Denops,
  context: Context,
  onCallback: OnCallback,
  options: DdcOptions,
  sourceOptions: SourceOptions,
  sourceParams: BaseSourceParams,
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
      await errorException(
        denops,
        e,
        `source: ${source.name} "getCompletePosition()" failed`,
      );
    }

    return -1;
  }
}

async function callSourceGather<
  Params extends BaseSourceParams,
  UserData extends unknown,
>(
  source: BaseSource<Params, UserData>,
  denops: Denops,
  context: Context,
  onCallback: OnCallback,
  options: DdcOptions,
  sourceOptions: SourceOptions,
  sourceParams: Params,
  completePos: number,
  completeStr: string,
  isIncomplete: boolean,
): Promise<DdcGatherItems<UserData>> {
  await checkSourceOnInit(source, denops, sourceOptions, sourceParams);

  try {
    const args = {
      denops,
      context,
      onCallback,
      options,
      sourceOptions,
      sourceParams,
      completePos,
      completeStr,
      isIncomplete,
    };

    return await deadline(source.gather(args), sourceOptions.timeout);
  } catch (e: unknown) {
    if (
      isTimeoutError(e) || isDdcCallbackCancelError(e) ||
      e instanceof DeadlineError
    ) {
      // Ignore timeout error
    } else {
      await errorException(
        denops,
        e,
        `source: ${source.name} "gather()" failed`,
      );
    }

    return [];
  }
}

async function callFilterOnEvent(
  filter: BaseFilter<BaseFilterParams>,
  denops: Denops,
  context: Context,
  onCallback: OnCallback,
  options: DdcOptions,
  filterOptions: FilterOptions,
  filterParams: BaseFilterParams,
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
      await errorException(
        denops,
        e,
        `filter: ${filter.name} "onEvent()" failed`,
      );
    }
  }
}

async function callFilterFilter(
  filter: BaseFilter<BaseFilterParams>,
  denops: Denops,
  context: Context,
  onCallback: OnCallback,
  options: DdcOptions,
  sourceOptions: SourceOptions,
  filterOptions: FilterOptions,
  filterParams: BaseFilterParams,
  completeStr: string,
  items: Item[],
): Promise<Item[]> {
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
      items,
    });
  } catch (e: unknown) {
    if (isTimeoutError(e) || isDdcCallbackCancelError(e)) {
      // Ignore timeout error
    } else {
      await errorException(
        denops,
        e,
        `filter: ${filter.name} "filter()" failed`,
      );
    }

    return [];
  }
}

async function errorException(denops: Denops, e: unknown, message: string) {
  await denops.call(
    "ddc#util#print_error",
    message,
  );
  if (e instanceof Error) {
    await denops.call(
      "ddc#util#print_error",
      e.message,
    );
    if (e.stack) {
      await denops.call(
        "ddc#util#print_error",
        e.stack,
      );
    }
  }
}

async function globpath(
  denops: Denops,
  searches: string[],
  files: string[],
): Promise<string[]> {
  const runtimepath = await op.runtimepath.getGlobal(denops);

  const check: Record<string, boolean> = {};
  const paths: string[] = [];
  for (const search of searches) {
    for (const file of files) {
      const glob = await fn.globpath(
        denops,
        runtimepath,
        search + file + ".ts",
        1,
        1,
      );

      for (const path of glob) {
        // Skip already added name.
        if (parse(path).name in check) {
          continue;
        }

        paths.push(path);
        check[parse(path).name] = true;
      }
    }
  }

  return paths;
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
    gather(
      _args: GatherArguments<{ min: number; max: number }> | Denops,
      _context?: Context,
      _options?: DdcOptions,
      _sourceOptions?: SourceOptions,
      _sourceParams?: BaseFilterParams,
      _completeStr?: string,
    ): Promise<Item[]> {
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
    maxItems: 500,
    converters: [],
    sorters: [],
  });
  assertEquals(p.by_, undefined);
  assertEquals(p, {
    ...defaultDummy(),
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
  const userParams: Record<string, BaseFilterParams> = {
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
      _filterParams?: BaseFilterParams,
      _completeStr?: string,
      _items?: Item[],
    ): Promise<Item[]> {
      return Promise.resolve([]);
    }
  }
  const filter = new F();
  filter.name = "/dev/null";
  assertEquals(filterArgs(userOptions, userParams, filter), [{
    ...defaultFilterOptions(),
  }, {
    ...defaultDummy(),
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
