import {
  Candidate,
  Context,
  DdcEvent,
  DdcOptions,
  FilterOptions,
  SourceOptions,
} from "../types.ts";
import { Denops } from "../deps.ts";

export type OnInitArguments<
  Params extends Record<string, unknown> = Record<string, unknown>,
> = {
  denops: Denops;
  filterOptions: FilterOptions;
  filterParams: Params;
};

export type OnEventArguments<
  Params extends Record<string, unknown> = Record<string, unknown>,
> = {
  denops: Denops;
  context: Context;
  options: DdcOptions;
  filterOptions: FilterOptions;
  filterParams: Params;
};

export type FilterArguments<
  Params extends Record<string, unknown> = Record<string, unknown>,
> = {
  denops: Denops;
  context: Context;
  options: DdcOptions;
  sourceOptions: SourceOptions;
  filterOptions: FilterOptions;
  filterParams: Params;
  completeStr: string;
  candidates: Candidate[];
};

export abstract class BaseFilter<
  Params extends Record<string, unknown> = Record<string, unknown>,
> {
  name = "";
  events: DdcEvent[] = [];
  isInitialized = false;

  // Use overload methods
  apiVersion = 3;

  async onInit(_args: OnInitArguments<Params>): Promise<void> {}

  async onEvent(_args: OnEventArguments<Params>): Promise<void> {}

  abstract filter({}: FilterArguments<Params>): Promise<Candidate[]>;

  abstract params(): Params;
}

export function defaultFilterOptions(): FilterOptions {
  return {
    placeholder: undefined,
  };
}

export function defaultFilterParams(): Record<string, unknown> {
  return {};
}
