import {
  Candidate,
  Context,
  DdcEvent,
  DdcOptions,
  SourceOptions,
} from "../types.ts";
import { Denops } from "../deps.ts";

export type OnInitArguments = {
  denops: Denops;
  sourceOptions: SourceOptions;
  sourceParams: Record<string, unknown>;
};

export type OnEventArguments = {
  denops: Denops;
  context: Context;
  options: DdcOptions;
  sourceOptions: SourceOptions;
  sourceParams: Record<string, unknown>;
};

export type GetCompletePositionArguments = {
  denops: Denops;
  context: Context;
  options: DdcOptions;
  sourceOptions: SourceOptions;
  sourceParams: Record<string, unknown>;
};

export type GatherCandidatesArguments = {
  denops: Denops;
  context: Context;
  options: DdcOptions;
  sourceOptions: SourceOptions;
  sourceParams: Record<string, unknown>;
  completeStr: string;
};

export abstract class BaseSource {
  name = "";
  isBytePos = false;
  events: DdcEvent[] = [];
  isInitialized = false;

  // Use overload methods
  apiVersion = 3;

  async onInit(_args: OnInitArguments): Promise<void> {}

  async onEvent(_args: OnEventArguments): Promise<void> {}

  getCompletePosition(
    args: GetCompletePositionArguments,
  ): Promise<number> {
    const matchPos = args.context.input.search(
      new RegExp("(" + args.options.keywordPattern + ")$"),
    );
    const completePos = matchPos != null ? matchPos : -1;
    return Promise.resolve(completePos);
  }

  abstract gatherCandidates(
    {}: GatherCandidatesArguments,
  ): Promise<Candidate[]>;

  params(): Record<string, unknown> {
    return {} as Record<string, unknown>;
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
  };
}

export function defaultSourceParams(): Record<string, unknown> {
  return {};
}
