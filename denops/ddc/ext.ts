import type {
  BaseParams,
  Context,
  DdcGatherItems,
  DdcItem,
  DdcOptions,
  DdcUserData,
  FilterOptions,
  Item,
  OnCallback,
  PreviewContext,
  Previewer,
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
import type { Loader } from "./loader.ts";
import { isDdcCallbackCancelError } from "./callback.ts";
import { type BaseUi, defaultUiOptions } from "./base/ui.ts";
import { type BaseSource, defaultSourceOptions } from "./base/source.ts";
import { type BaseFilter, defaultFilterOptions } from "./base/filter.ts";
import { printError } from "./utils.ts";

import type { Denops } from "@denops/std";

import { deadline } from "@std/async/deadline";

export async function getUi(
  denops: Denops,
  loader: Loader,
  options: DdcOptions,
): Promise<[
  BaseUi<BaseParams> | undefined,
  UiOptions,
  BaseParams,
]> {
  const name = options.ui;

  if (name.length === 0) {
    return [
      undefined,
      defaultUiOptions(),
      defaultDummy(),
    ];
  }

  const ui = await loader.getUi(denops, name);
  if (!ui) {
    await printError(
      denops,
      `Not found ui: "${name}"`,
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

export async function getSource(
  denops: Denops,
  loader: Loader,
  options: DdcOptions,
  userSource: UserSource,
): Promise<
  [
    BaseSource<BaseParams> | undefined,
    SourceOptions,
    BaseParams,
  ]
> {
  const name = source2Name(userSource);

  const source = await loader.getSource(denops, name);
  if (!source) {
    await printError(
      denops,
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

  await checkSourceOnInit(
    source,
    denops,
    sourceOptions,
    sourceParams,
  );

  return [source, sourceOptions, sourceParams];
}

export async function getFilter(
  denops: Denops,
  loader: Loader,
  options: DdcOptions,
  userFilter: UserFilter,
): Promise<
  [
    BaseFilter<BaseParams> | undefined,
    FilterOptions,
    BaseParams,
  ]
> {
  const name = filter2Name(userFilter);

  const filter = await loader.getFilter(denops, name);
  if (!filter) {
    await printError(
      denops,
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

export async function getPreviewer(
  denops: Denops,
  loader: Loader,
  context: Context,
  options: DdcOptions,
  item: DdcItem,
  sourceName: SourceName,
  previewContext: PreviewContext,
): Promise<Previewer> {
  if (sourceName.length === 0) {
    return { kind: "empty" };
  }

  const [source, sourceOptions, sourceParams] = await getSource(
    denops,
    loader,
    options,
    sourceName,
  );
  if (!source || !source.getPreviewer || !sourceOptions.preview) {
    return { kind: "empty" };
  }

  const previewer = await source.getPreviewer({
    denops,
    context,
    options,
    sourceOptions,
    sourceParams,
    item,
    previewContext,
  });

  return previewer;
}

export async function filterItems(
  denops: Denops,
  loader: Loader,
  context: Context,
  onCallback: OnCallback,
  options: DdcOptions,
  sourceOptions: SourceOptions,
  completeStr: string,
  cdd: Item[],
): Promise<Item[]> {
  async function callFilters(
    loader: Loader,
    userFilters: UserFilter[],
  ): Promise<Item[]> {
    for (const userFilter of userFilters) {
      const [filter, filterOptions, filterParams] = await getFilter(
        denops,
        loader,
        options,
        userFilter,
      );
      if (!filter) {
        return [];
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

  cdd = await callFilters(loader, sourceOptions.matchers);

  if (sourceOptions.matcherKey !== "") {
    cdd = cdd.map((c) => (
      {
        ...c,
        // @ts-ignore: Restore matcherKey
        word: c.__word,
      }
    ));
  }

  cdd = await callFilters(loader, sourceOptions.sorters);

  // Filter by maxItems
  cdd = cdd.slice(0, sourceOptions.maxItems);

  cdd = await callFilters(loader, sourceOptions.converters);

  return cdd;
}

export async function onEvent(
  denops: Denops,
  loader: Loader,
  context: Context,
  onCallback: OnCallback,
  options: DdcOptions,
): Promise<void> {
  let filters: UserFilter[] = [];
  for (let userSource of options.sources) {
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
    const [source, sourceOptions, sourceParams] = await getSource(
      denops,
      loader,
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
    const [filter, filterOptions, filterParams] = await getFilter(
      denops,
      loader,
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

export async function onCompleteDone(
  denops: Denops,
  loader: Loader,
  context: Context,
  onCallback: OnCallback,
  options: DdcOptions,
  userSource: UserSource,
  userData: DdcUserData,
): Promise<void> {
  const [source, sourceOptions, sourceParams] = await getSource(
    denops,
    loader,
    options,
    userSource,
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

function uiArgs<Params extends BaseParams>(
  options: DdcOptions,
  ui: BaseUi<Params>,
): [UiOptions, BaseParams] {
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
  Params extends BaseParams,
  UserData extends unknown,
>(
  source: BaseSource<Params, UserData> | null,
  options: DdcOptions,
  userSource: UserSource | null,
): [SourceOptions, BaseParams] {
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
  Params extends BaseParams,
>(
  filter: BaseFilter<Params>,
  options: DdcOptions,
  userFilter: UserFilter,
): [FilterOptions, BaseParams] {
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
  ui: BaseUi<BaseParams>,
  denops: Denops,
  uiOptions: UiOptions,
  uiParams: BaseParams,
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
    await printError(
      denops,
      e,
      `ui: ${ui.name} "onInit()" failed`,
    );
  }
}

async function checkSourceOnInit(
  source: BaseSource<BaseParams>,
  denops: Denops,
  sourceOptions: SourceOptions,
  sourceParams: BaseParams,
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

    if (source.apiVersion < 5) {
      // API version check
      await printError(
        denops,
        `source is too old: "${source.name}"`,
      );
    }
  } catch (e: unknown) {
    await printError(
      denops,
      e,
      `source: ${source.name} "onInit()" failed`,
    );
  }
}

async function checkFilterOnInit(
  filter: BaseFilter<BaseParams>,
  denops: Denops,
  filterOptions: FilterOptions,
  filterParams: BaseParams,
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
    await printError(
      denops,
      e,
      `filter: ${filter.name} "onInit()" failed`,
    );
  }
}

async function callSourceOnEvent(
  source: BaseSource<BaseParams>,
  denops: Denops,
  context: Context,
  onCallback: OnCallback,
  options: DdcOptions,
  sourceOptions: SourceOptions,
  sourceParams: BaseParams,
) {
  if (!source.events?.includes(context.event)) {
    return;
  }

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
    if (isDdcCallbackCancelError(e)) {
      // Ignore timeout error
    } else {
      await printError(
        denops,
        e,
        `source: ${source.name} "onEvent()" failed`,
      );
    }
  }
}

async function callSourceOnCompleteDone<
  Params extends BaseParams,
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
    if (isDdcCallbackCancelError(e)) {
      // Ignore timeout error
    } else {
      await printError(
        denops,
        e,
        `source: ${source.name} "onCompleteDone()" failed`,
      );
    }
  }
}

export async function callSourceGetCompletePosition(
  source: BaseSource<BaseParams>,
  denops: Denops,
  context: Context,
  onCallback: OnCallback,
  options: DdcOptions,
  sourceOptions: SourceOptions,
  sourceParams: BaseParams,
): Promise<number> {
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
    if (isDdcCallbackCancelError(e)) {
      // Ignore timeout error
    } else {
      await printError(
        denops,
        e,
        `source: ${source.name} "getCompletePosition()" failed`,
      );
    }

    return -1;
  }
}

export async function callSourceGather<
  Params extends BaseParams,
  UserData extends unknown,
>(
  source: BaseSource<Params, UserData>,
  denops: Denops,
  context: Context,
  onCallback: OnCallback,
  options: DdcOptions,
  sourceOptions: SourceOptions,
  sourceParams: Params,
  loader: Loader,
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
      loader,
      completePos,
      completeStr,
      isIncomplete,
    };

    return await deadline(source.gather(args), sourceOptions.timeout);
  } catch (e: unknown) {
    if (
      isDdcCallbackCancelError(e) ||
      e instanceof DOMException
    ) {
      // Ignore timeout error
    } else {
      await printError(
        denops,
        e,
        `source: ${source.name} "gather()" failed`,
      );
    }

    return [];
  }
}

async function callFilterOnEvent(
  filter: BaseFilter<BaseParams>,
  denops: Denops,
  context: Context,
  onCallback: OnCallback,
  options: DdcOptions,
  filterOptions: FilterOptions,
  filterParams: BaseParams,
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
    if (isDdcCallbackCancelError(e)) {
      // Ignore timeout error
    } else {
      await printError(
        denops,
        e,
        `filter: ${filter.name} "onEvent()" failed`,
      );
    }
  }
}

export async function callFilterFilter(
  filter: BaseFilter<BaseParams>,
  denops: Denops,
  context: Context,
  onCallback: OnCallback,
  options: DdcOptions,
  sourceOptions: SourceOptions,
  filterOptions: FilterOptions,
  filterParams: BaseParams,
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
    if (isDdcCallbackCancelError(e)) {
      // Ignore timeout error
    } else {
      await printError(
        denops,
        e,
        `filter: ${filter.name} "filter()" failed`,
      );
    }

    return [];
  }
}

function source2Name(s: UserSource) {
  return typeof s === "string" ? s : s.name;
}

function filter2Name(f: UserFilter) {
  return typeof f === "string" ? f : f.name;
}
