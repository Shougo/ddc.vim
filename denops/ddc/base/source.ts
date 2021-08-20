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

  // Use overload methods
  apiVersion = 1;

  // Deprecated
  async onInit(
    _denops: Denops,
  ): Promise<void>;

  // New
  async onInit({
    denops: Denops,
  }: OnInitArguments): Promise<void>;

  async onInit(
    _args: OnInitArguments | Denops,
  ): Promise<void> {}

  // Deprecated
  async onEvent(
    denops: Denops,
    context: Context,
    options: DdcOptions,
    sourceOptions: SourceOptions,
    sourceParams: Record<string, unknown>,
  ): Promise<void>;

  // New
  async onEvent({}: OnEventArguments): Promise<void>;

  async onEvent(
    _args: OnInitArguments | Denops,
  ): Promise<void> {}

  // Deprecated
  getCompletePosition(
    _denops: Denops,
    context: Context,
    options: DdcOptions,
    _sourceOptions: SourceOptions,
    _sourceParams: Record<string, unknown>,
  ): Promise<number>;

  // New
  getCompletePosition(args: GetCompletePositionArguments): Promise<number>;

  getCompletePosition(
    args: GetCompletePositionArguments | Denops,
    _context?: Context,
    _options?: DdcOptions,
    _sourceOptions?: SourceOptions,
    _sourceParams?: Record<string, unknown>,
  ): Promise<number> {
    if ("context" in args && "options" in args) {
      const matchPos = args.context.input.search(
        new RegExp("(" + args.options.keywordPattern + ")$"),
      );
      const completePos = matchPos != null ? matchPos : -1;
      return Promise.resolve(completePos);
    }

    return Promise.resolve(-1);
  }

  // Deprecated
  abstract gatherCandidates(
    denops: Denops,
    context: Context,
    options: DdcOptions,
    sourceOptions: SourceOptions,
    sourceParams: Record<string, unknown>,
    completeStr: string,
  ): Promise<Candidate[]>;

  // New
  abstract gatherCandidates(
    args: GatherCandidatesArguments,
  ): Promise<Candidate[]>;

  params(): Record<string, unknown> {
    return {} as Record<string, unknown>;
  }
}

export function defaultSourceOptions(): SourceOptions {
  return {
    converters: [],
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
