import {
  Candidate,
  Context,
  DdcEvent,
  DdcOptions,
  FilterOptions,
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
  filterOptions: FilterOptions;
  filterParams: Record<string, unknown>;
};

export type FilterArguments = {
  denops: Denops;
  context: Context;
  options: DdcOptions;
  sourceOptions: SourceOptions;
  filterOptions: FilterOptions;
  filterParams: Record<string, unknown>;
  completeStr: string;
  candidates: Candidate[];
};

export abstract class BaseFilter {
  name = "";
  events: DdcEvent[] = [];

  // Use overload methods
  apiVersion = 2;

  async onInit(_args: OnInitArguments): Promise<void> {}

  async onEvent(_args: OnEventArguments): Promise<void> {}

  abstract filter({}: FilterArguments): Promise<Candidate[]>;

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
