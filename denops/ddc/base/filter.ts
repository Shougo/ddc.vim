import { Candidate, Context, FilterOptions } from "../types.ts";
import { Denops } from "../deps.ts";

export abstract class BaseFilter {
  name = "";

  async onEvent(
    _denops: Denops,
    _context: Context,
    _options: FilterOptions,
    _params: Record<string, unknown>,
  ): Promise<void> {}

  abstract filter(
    denops: Denops,
    context: Context,
    options: FilterOptions,
    params: Record<string, unknown>,
    candidates: Candidate[],
  ): Promise<Candidate[]>;

  params(): Record<string, unknown> {
    return {} as Record<string, unknown>;
  }
}

export function defaultFilterOptions(): FilterOptions {
  return {
    placeholder: undefined,
  };
}

export function defaultFilterParams(): Record<string, unknown> {
  return {};
}
