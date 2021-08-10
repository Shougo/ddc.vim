import {
  Candidate,
  Context,
  DdcEvent,
  DdcOptions,
  SourceOptions,
} from "../types.ts";
import { Denops } from "../deps.ts";

export abstract class BaseSource {
  name = "";
  isBytePos = false;
  events: DdcEvent[] = [];

  async onInit(
    _denops: Denops,
  ): Promise<void> {}

  async onEvent(
    _denops: Denops,
    _context: Context,
    _options: DdcOptions,
    _sourceOptions: SourceOptions,
    _sourceParams: Record<string, unknown>,
  ): Promise<void> {}

  getCompletePosition(
    _denops: Denops,
    context: Context,
    options: DdcOptions,
    _sourceOptions: SourceOptions,
    _sourceParams: Record<string, unknown>,
  ): Promise<number> {
    const matchPos = context.input.search(
      new RegExp(options.keywordPattern + "$"),
    );
    const completePos = matchPos != null ? matchPos : -1;
    return Promise.resolve(completePos);
  }

  abstract gatherCandidates(
    denops: Denops,
    context: Context,
    options: DdcOptions,
    sourceOptions: SourceOptions,
    sourceParams: Record<string, unknown>,
    completeStr: string,
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
