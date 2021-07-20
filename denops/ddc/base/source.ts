import { Candidate, Context, SourceOptions } from "../types.ts";
import { Denops } from "../deps.ts";

export abstract class BaseSource {
  name = "";

  getCompletePosition(
    _denops: Denops,
    context: Context,
    _options: SourceOptions,
    _params: Record<string, unknown>,
  ): Promise<number> {
    const matchPos = context.input.search(/\w+$/);
    const completePos = matchPos != null ? matchPos : -1;
    return Promise.resolve(completePos);
  }

  abstract gatherCandidates(
    denops: Denops,
    context: Context,
    options: SourceOptions,
    params: Record<string, unknown>,
  ): Promise<ReadableStream<Candidate[]>>;

  params(): Record<string, unknown> {
    return {} as Record<string, unknown>;
  }
}

export function defaultSourceOptions(): SourceOptions {
  return {
    mark: "",
    maxCandidates: 500,
    matchers: [],
    sorters: [],
    converters: [],
  };
}

export function defaultSourceParams(): Record<string, unknown> {
  return {};
}
