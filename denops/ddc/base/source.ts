import {
  Context,
  DdcEvent,
  DdcGatherItems,
  DdcOptions,
  OnCallback,
  SourceOptions,
} from "../types.ts";
import { Denops } from "../deps.ts";
import { convertKeywordPattern } from "../util.ts";

export type BaseSourceParams = Record<string, unknown>;

export type OnInitArguments<Params extends BaseSourceParams> = {
  denops: Denops;
  sourceOptions: SourceOptions;
  sourceParams: Params;
};

export type OnEventArguments<Params extends BaseSourceParams> = {
  denops: Denops;
  context: Context;
  onCallback: OnCallback;
  options: DdcOptions;
  sourceOptions: SourceOptions;
  sourceParams: Params;
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
  // To prevent users from accessing internal variables.
  userData: UserData;
};

export type GetCompletePositionArguments<Params extends BaseSourceParams> = {
  denops: Denops;
  context: Context;
  onCallback: OnCallback;
  options: DdcOptions;
  sourceOptions: SourceOptions;
  sourceParams: Params;
};

export type GatherArguments<Params extends BaseSourceParams> = {
  denops: Denops;
  context: Context;
  onCallback: OnCallback;
  options: DdcOptions;
  sourceOptions: SourceOptions;
  sourceParams: Params;
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
  apiVersion = 5;

  events: DdcEvent[] = [];
  isBytePos = false;

  async onInit(_args: OnInitArguments<Params>): Promise<void> {}

  async onEvent(_args: OnEventArguments<Params>): Promise<void> {}

  async onCompleteDone(
    _args: OnCompleteDoneArguments<Params, UserData>,
  ): Promise<void> {}

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
    maxItems: 500,
    maxKeywordLength: 0,
    minAutoCompleteLength: 2,
    minKeywordLength: 0,
    sorters: [],
    timeout: 2000,
  };
}
