import type {
  BaseParams,
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

import type { Denops } from "jsr:@denops/std@~7.5.0";

export type OnInitArguments<Params extends BaseParams> = {
  denops: Denops;
  sourceOptions: SourceOptions;
  sourceParams: Params;
};

type BaseSourceArguments<Params extends BaseParams> = {
  denops: Denops;
  context: Context;
  options: DdcOptions;
  sourceOptions: SourceOptions;
  sourceParams: Params;
};

export type OnEventArguments<Params extends BaseParams> =
  & BaseSourceArguments<Params>
  & {
    onCallback: OnCallback;
  };

export type OnCompleteDoneArguments<
  Params extends BaseParams,
  UserData extends unknown = unknown,
> = BaseSourceArguments<Params> & {
  onCallback: OnCallback;
  // To prevent users from accessing internal variables.
  userData: UserData;
};

export type GetPreviewerArguments<
  Params extends BaseParams,
  UserData extends unknown = unknown,
> = BaseSourceArguments<Params> & {
  item: Item<UserData>;
  previewContext: PreviewContext;
};

export type GetCompletePositionArguments<Params extends BaseParams> =
  & BaseSourceArguments<Params>
  & {
    onCallback: OnCallback;
  };

export type GatherArguments<Params extends BaseParams> =
  & BaseSourceArguments<Params>
  & {
    onCallback: OnCallback;
    completePos: number;
    completeStr: string;
    isIncomplete?: boolean;
  };

export abstract class BaseSource<
  Params extends BaseParams,
  UserData extends unknown = unknown,
> {
  name = "";
  path = "";
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

    const completePos = args.context.input.search(
      new RegExp("(?:" + keywordPattern + ")$"),
    );
    return completePos;
  }

  abstract gather(
    {}: GatherArguments<Params>,
  ): Promise<DdcGatherItems<UserData>>;

  abstract params(): Params;
}

export function defaultSourceOptions(): SourceOptions {
  return {
    cacheTimeout: 0,
    converters: [],
    dup: "ignore",
    enabledIf: "",
    forceCompletionPattern: "",
    hideTimeout: 200,
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
