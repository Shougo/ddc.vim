import { Candidate, Context, FilterOptions } from "../types.ts";
import { Denops } from "../deps.ts";

export abstract class BaseFilter {
  name = "";
  abstract filter(
    denops: Denops,
    context: Context,
    options: FilterOptions,
    params: Record<string, unknown>,
    candidates: Candidate[],
  ): Promise<Candidate[]>;

  abstract params(): Record<string, unknown>;
}

export function defaultFilterOptions(): FilterOptions {
  return {
    placeholder: undefined,
  };
}

export function defaultFilterParams(): Record<string, unknown> {
  return {};
}
