import { Candidate, Context, SourceOptions } from "../types.ts";
import { Denops } from "../deps.ts";

export abstract class BaseSource {
  name = "";
  abstract gatherCandidates(
    denops: Denops,
    context: Context,
    options: SourceOptions,
    params: Record<string, unknown>,
  ): Promise<Candidate[]>;

  abstract params(): Record<string, unknown>;
}

export function defaultSourceOptions(): SourceOptions {
  return {
    mark: "",
    matchers: [],
    sorters: [],
    converters: [],
  };
}

export function defaultSourceParams(): Record<string, unknown> {
  return {};
}
