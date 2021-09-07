import {
  Candidate,
  Context,
  DdcEvent,
  DdcOptions,
  SourceOptions,
} from "../types.ts";
import { Denops } from "../deps.ts";

export type OnInitArguments<SourceParams> = {
  denops: Denops;
  sourceOptions: SourceOptions;
  sourceParams: SourceParams;
};

export type OnEventArguments<SourceParams> = {
  denops: Denops;
  context: Context;
  options: DdcOptions;
  sourceOptions: SourceOptions;
  sourceParams: SourceParams;
};

export type GetCompletePositionArguments<SourceParams> = {
  denops: Denops;
  context: Context;
  options: DdcOptions;
  sourceOptions: SourceOptions;
  sourceParams: SourceParams;
};

export type GatherCandidatesArguments<SourceParams> = {
  denops: Denops;
  context: Context;
  options: DdcOptions;
  sourceOptions: SourceOptions;
  sourceParams: SourceParams;
  completeStr: string;
};

export abstract class BaseSource<SourceParams = Record<string, never>> {
  name = "";
  isBytePos = false;
  events: DdcEvent[] = [];
  isInitialized = false;

  // Use overload methods
  apiVersion = 3;

  async onInit(_args: OnInitArguments<SourceParams>): Promise<void> {}

  async onEvent(_args: OnEventArguments<SourceParams>): Promise<void> {}

  getCompletePosition(
    args: GetCompletePositionArguments<SourceParams>,
  ): Promise<number> {
    const matchPos = args.context.input.search(
      new RegExp("(" + args.options.keywordPattern + ")$"),
    );
    const completePos = matchPos != null ? matchPos : -1;
    return Promise.resolve(completePos);
  }

  abstract gatherCandidates(
    {}: GatherCandidatesArguments<SourceParams>,
  ): Promise<Candidate[]>;

  params(): SourceParams {
    return {} as SourceParams;
  }
}

export function defaultSourceOptions(): SourceOptions {
  return {
    converters: [],
    dup: false,
    forceCompletionPattern: "",
    ignoreCase: false,
    isVolatile: false,
    mark: "",
    matcherKey: "",
    matchers: [],
    maxAutoCompleteLength: 80,
    maxCandidates: 500,
    minAutoCompleteLength: 2,
    sorters: [],
    timeout: 2000,
  };
}

export function defaultSourceParams(): Record<string, unknown> {
  return {};
}
