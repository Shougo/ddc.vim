import {
  BaseFilter,
  BaseFilterParams,
  BaseSource,
  BaseSourceParams,
  BaseUi,
  BaseUiParams,
  Context,
  DdcEvent,
  DdcExtType,
  DdcGatherItems,
  DdcItem,
  DdcOptions,
  DdcUserData,
  FilterOptions,
  Item,
  OnCallback,
  SourceName,
  SourceOptions,
  UiOptions,
  UserFilter,
  UserSource,
} from "./types.ts";
import {
  defaultDummy,
  foldMerge,
  mergeFilterOptions,
  mergeFilterParams,
  mergeSourceOptions,
  mergeSourceParams,
  mergeUiOptions,
  mergeUiParams,
} from "./context.ts";
import { Loader } from "./loader.ts";
import { defaultUiOptions } from "./base/ui.ts";
import { defaultSourceOptions } from "./base/source.ts";
import { defaultFilterOptions } from "./base/filter.ts";
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
} from "./deps.ts";
import { convertKeywordPattern } from "./util.ts";

type DdcResult = {
  items: Item[];
  completeStr: string;
  prevInput: string;
  lineNr: number;
  isIncomplete: boolean;
};

export class Ddc {
  private loader: Loader;
  private prevResults: Record<SourceName, DdcResult> = {};
  private events: DdcEvent[] = [];
  private visibleUi = false;

  prevSources: UserSource[] = [];
  prevUi = "";

  constructor(loader: Loader) {
    this.loader = loader;
  }

  async registerAutocmd(denops: Denops, events: DdcEvent[]) {
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

  async autoload(
    denops: Denops,
    type: DdcExtType,
    name: string,
  ) {
    const paths = await globpath(
      denops,
      `denops/@ddc-${type}s/`,
      this.loader.getAlias(type, name) ?? name,
    );

    if (paths.length === 0) {
      return;
    }

    await this.loader.registerPath(type, paths[0]);
  }

  async onEvent(
    denops: Denops,
    context: Context,
    onCallback: OnCallback,
    options: DdcOptions,
  ): Promise<void> {
    let filters: UserFilter[] = [];
    for (let userSource of options.sources) {
      if (typeof (userSource) === "string") {
        userSource = {
          name: userSource,
        };
      }
      const o = foldMerge(
        mergeSourceOptions,
        defaultSourceOptions,
        [
          options.sourceOptions["_"],
          options.sourceOptions[userSource.name],
          userSource?.options,
        ],
      );

      filters = filters.concat(
        o.matchers,
        o.sorters,
        o.converters,
      );
    }

    for (const userSource of options.sources) {
      const [source, sourceOptions, sourceParams] = await this.getSource(
        denops,
        options,
        userSource,
      );
      if (!source) {
        return;
      }

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

    // Uniq.
    filters = [
      ...new Set(filters.concat(options.postFilters)),
    ];

    for (const userFilter of filters) {
      const [filter, filterOptions, filterParams] = await this.getFilter(
        denops,
        options,
        userFilter,
      );
      if (!filter) {
        continue;
      }
      await callFilterOnEvent(
        filter,
        denops,
        context,
        onCallback,
        options,
        filterOptions,
        filterParams,
      );
    }
  }

  async onCompleteDone(
    denops: Denops,
    context: Context,
    onCallback: OnCallback,
    options: DdcOptions,
    sourceName: SourceName,
    userData: DdcUserData,
  ): Promise<void> {
    const [source, sourceOptions, sourceParams] = await this.getSource(
      denops,
      options,
      sourceName,
    );
    if (!source || !source.onCompleteDone) {
      return;
    }

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
    this.prevSources = options.sources;

    const rs = await Promise.all(options.sources.map(async (userSource) => {
      const [s, o, p] = await this.getSource(
        denops,
        options,
        userSource,
      );
      // Check enabled
      if (
        !s || (o.enabledIf !== "" && !(await denops.call("eval", o.enabledIf)))
      ) {
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
      // NOTE: If forceCompletion and not matched getCompletePosition(),
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
        // NOTE: Merge word by completePos
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
    for (const userFilter of options.postFilters) {
      const [filter, filterOptions, filterParams] = await this.getFilter(
        denops,
        options,
        userFilter,
      );
      if (!filter) {
        continue;
      }

      // @ts-ignore: postFilters does not change items keys
      retItems = await callFilterFilter(
        filter,
        denops,
        context,
        onCallback,
        options,
        defaultSourceOptions(),
        filterOptions,
        filterParams,
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
    completeStr: string,
    cdd: Item[],
  ): Promise<Item[]> {
    async function callFilters(
      ddc: Ddc,
      userFilters: UserFilter[],
    ): Promise<Item[]> {
      for (const userFilter of userFilters) {
        const [filter, filterOptions, filterParams] = await ddc.getFilter(
          denops,
          options,
          userFilter,
        );
        if (!filter) {
          continue;
        }
        cdd = await callFilterFilter(
          filter,
          denops,
          context,
          onCallback,
          options,
          sourceOptions,
          filterOptions,
          filterParams,
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

    cdd = await callFilters(this, sourceOptions.matchers);

    if (sourceOptions.matcherKey !== "") {
      cdd = cdd.map((c) => (
        {
          ...c,
          // @ts-ignore: Restore matcherKey
          word: c.__word,
        }
      ));
    }

    cdd = await callFilters(this, sourceOptions.sorters);

    // Filter by maxItems
    cdd = cdd.slice(0, sourceOptions.maxItems);

    cdd = await callFilters(this, sourceOptions.converters);

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
      return [
        undefined,
        defaultUiOptions(),
        defaultDummy(),
      ];
    }

    if (!this.loader.getUi(options.ui)) {
      await this.autoload(denops, "ui", options.ui);
    }
    const ui = this.loader.getUi(options.ui);
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

  async getSource(
    denops: Denops,
    options: DdcOptions,
    userSource: UserSource,
  ): Promise<
    [
      BaseSource<BaseSourceParams> | undefined,
      SourceOptions,
      BaseSourceParams,
    ]
  > {
    const name = source2Name(userSource);
    if (!this.loader.getSource(name)) {
      await this.autoload(denops, "source", name);
    }

    const source = this.loader.getSource(name);
    if (!source) {
      await denops.call(
        "ddu#util#print_error",
        `Not found source: ${name}`,
      );
      return [
        undefined,
        defaultSourceOptions(),
        defaultDummy(),
      ];
    }

    const [sourceOptions, sourceParams] = sourceArgs(
      source,
      options,
      userSource,
    );

    await checkSourceOnInit(source, denops, sourceOptions, sourceParams);

    return [source, sourceOptions, sourceParams];
  }

  async getFilter(
    denops: Denops,
    options: DdcOptions,
    userFilter: UserFilter,
  ): Promise<
    [
      BaseFilter<BaseFilterParams> | undefined,
      FilterOptions,
      BaseFilterParams,
    ]
  > {
    const name = filter2Name(userFilter);
    if (!this.loader.getFilter(name)) {
      await this.autoload(denops, "filter", name);
    }

    const filter = this.loader.getFilter(name);
    if (!filter) {
      await denops.call(
        "ddu#util#print_error",
        `Not found filter: ${name}`,
      );
      return [
        undefined,
        defaultFilterOptions(),
        defaultDummy(),
      ];
    }

    const [filterOptions, filterParams] = filterArgs(
      filter,
      options,
      userFilter,
    );
    await checkFilterOnInit(filter, denops, filterOptions, filterParams);

    return [filter, filterOptions, filterParams];
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
  source: BaseSource<Params, UserData> | null,
  options: DdcOptions,
  userSource: UserSource | null,
): [SourceOptions, BaseSourceParams] {
  // Convert type
  if (typeof userSource === "string") {
    userSource = {
      name: userSource,
    };
  }

  const o = foldMerge(
    mergeSourceOptions,
    defaultSourceOptions,
    [
      options.sourceOptions["_"],
      source ? options.sourceOptions[source.name] : {},
      userSource?.options,
    ],
  );
  const p = foldMerge(
    mergeSourceParams,
    defaultDummy,
    [
      source?.params(),
      options.sourceParams["_"],
      source ? options.sourceParams[source.name] : {},
      userSource?.params,
    ],
  );
  return [o, p];
}

function filterArgs<
  Params extends BaseFilterParams,
>(
  filter: BaseFilter<Params>,
  options: DdcOptions,
  userFilter: UserFilter,
): [FilterOptions, BaseFilterParams] {
  // Convert type
  if (typeof userFilter === "string") {
    userFilter = {
      name: userFilter,
    };
  }

  const o = foldMerge(
    mergeFilterOptions,
    defaultFilterOptions,
    [
      options.filterOptions["_"],
      options.filterOptions[filter.name],
      userFilter?.options,
    ],
  );
  const p = foldMerge(
    mergeFilterParams,
    defaultDummy,
    [
      filter?.params(),
      options.filterParams["_"],
      options.filterParams[filter.name],
      userFilter?.params,
    ],
  );
  return [o, p];
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
  if (!source.events?.includes(context.event)) {
    return;
  }

  try {
    if (source.apiVersion < 5) {
      // NOTE: It is for backward compatibility.
      // Convert keywordPattern
      // deno-lint-ignore-file
      options.keywordPattern = await convertKeywordPattern(
        denops,
        sourceOptions.keywordPattern,
      );
    }

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
  try {
    if (source.apiVersion < 5) {
      // NOTE: It is for backward compatibility.
      // Convert keywordPattern
      options.keywordPattern = await convertKeywordPattern(
        denops,
        sourceOptions.keywordPattern,
      );
    }

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
  if (!filter.events?.includes(context.event)) {
    return;
  }

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
  } else {
    console.log(e);
  }
}

async function globpath(
  denops: Denops,
  search: string,
  file: string,
): Promise<string[]> {
  const runtimepath = await op.runtimepath.getGlobal(denops);

  const check: Record<string, boolean> = {};
  const paths: string[] = [];
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

  return paths;
}

function source2Name(s: UserSource) {
  return typeof (s) === "string" ? s : s.name;
}

function filter2Name(f: UserFilter) {
  return typeof (f) === "string" ? f : f.name;
}

Deno.test("byteposToCharpos", () => {
  assertEquals(byteposToCharpos("あ hoge", 4), 2);
});

Deno.test("charposToBytepos", () => {
  assertEquals(charposToBytepos("あ hoge", 2), 4);
});
