import type {
  Context,
  DdcEvent,
  DdcGatherItems,
  DdcOptions,
  Item,
  OnCallback,
  PreviewContext,
  Previewer,
  SourceOptions,
} from "../types.ts";
import { convertKeywordPattern } from "../utils.ts";
import type { Loader } from "../loader.ts";

import type { Denops } from "jsr:@denops/std@~7.1.0";

export type BaseSourceParams = Record<string, unknown>;

export type OnInitArguments<Params extends BaseSourceParams> = {
  denops: Denops;
  sourceOptions: SourceOptions;
  sourceParams: Params;
  loader: Loader;
};

export type OnEventArguments<Params extends BaseSourceParams> = {
  denops: Denops;
  context: Context;
  onCallback: OnCallback;
  options: DdcOptions;
  sourceOptions: SourceOptions;
  sourceParams: Params;
  loader: Loader;
};

export type OnCompleteDoneArguments<
  Params extends BaseSourceParams,
  UserData extends unknown = unknown,
> = {
  denops: Denops;
  context: Context;
  onCallback: OnCallback;
  options: DdcOptions;
  sourceOptions: SourceOptions;
  sourceParams: Params;
  loader: Loader;
  // To prevent users from accessing internal variables.
  userData: UserData;
};

export type GetPreviewerArguments<
  Params extends BaseSourceParams,
  UserData extends unknown = unknown,
> = {
  denops: Denops;
  context: Context;
  options: DdcOptions;
  sourceOptions: SourceOptions;
  sourceParams: Params;
  item: Item<UserData>;
  previewContext: PreviewContext;
  loader: Loader;
};

export type GetCompletePositionArguments<Params extends BaseSourceParams> = {
  denops: Denops;
  context: Context;
  onCallback: OnCallback;
  options: DdcOptions;
  sourceOptions: SourceOptions;
  sourceParams: Params;
  loader: Loader;
};

export type GatherArguments<Params extends BaseSourceParams> = {
  denops: Denops;
  context: Context;
  onCallback: OnCallback;
  options: DdcOptions;
  sourceOptions: SourceOptions;
  sourceParams: Params;
  loader: Loader;
  completePos: number;
  completeStr: string;
  isIncomplete?: boolean;
};

export abstract class BaseSource<
  Params extends BaseSourceParams,
  UserData extends unknown = unknown,
> {
  name = "";
  isInitialized = false;
  apiVersion = 6;

  events: DdcEvent[] = [];
  isBytePos = false;

  onInit(_args: OnInitArguments<Params>): void | Promise<void> {}

  onEvent(_args: OnEventArguments<Params>): void | Promise<void> {}

  onCompleteDone(
    _args: OnCompleteDoneArguments<Params, UserData>,
  ): void | Promise<void> {}

  getPreviewer(
    _args: GetPreviewerArguments<Params>,
  ): Previewer | Promise<Previewer> {
    return { kind: "empty" };
  }

  getCompletePosition(
    args: GetCompletePositionArguments<Params>,
  ): number | Promise<number>;

  async getCompletePosition(
    args: GetCompletePositionArguments<Params>,
  ): Promise<number> {
    // Convert keywordPattern
    const keywordPattern = await convertKeywordPattern(
      args.denops,
      args.sourceOptions.keywordPattern,
    );

    const matchPos = args.context.input.search(
      new RegExp("(?:" + keywordPattern + ")$"),
    );
    const completePos = matchPos !== null ? matchPos : -1;
    return Promise.resolve(completePos);
  }

  abstract gather(
    {}: GatherArguments<Params>,
  ): Promise<DdcGatherItems<UserData>>;

  abstract params(): Params;
}

export function defaultSourceOptions(): SourceOptions {
  return {
    converters: [],
    dup: "ignore",
    enabledIf: "",
    forceCompletionPattern: "",
    keywordPattern: "\\k*",
    ignoreCase: false,
    isVolatile: false,
    mark: "",
    matcherKey: "",
    matchers: [],
    maxAutoCompleteLength: 80,
    maxManualCompleteLength: 80,
    maxItems: 500,
    maxKeywordLength: 0,
    minAutoCompleteLength: 2,
    minManualCompleteLength: 1,
    minKeywordLength: 0,
    preview: true,
    replaceSourceInputPattern: "",
    sorters: [],
    timeout: 2000,
  };
}
