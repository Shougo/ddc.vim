import {
  Context,
  DdcEvent,
  DdcOptions,
  FilterOptions,
  Item,
  OnCallback,
  SourceOptions,
} from "../types.ts";
import { Denops } from "../deps.ts";

export type BaseFilterParams = Record<string, unknown>;

export type OnInitArguments<Params extends BaseFilterParams> = {
  denops: Denops;
  filterOptions: FilterOptions;
  filterParams: Params;
};

export type OnEventArguments<Params extends BaseFilterParams> = {
  denops: Denops;
  context: Context;
  onCallback: OnCallback;
  options: DdcOptions;
  filterOptions: FilterOptions;
  filterParams: Params;
};

export type FilterArguments<Params extends BaseFilterParams> = {
  denops: Denops;
  context: Context;
  onCallback: OnCallback;
  options: DdcOptions;
  sourceOptions: SourceOptions;
  filterOptions: FilterOptions;
  filterParams: Params;
  completeStr: string;
  items: Item[];
};

export abstract class BaseFilter<Params extends BaseFilterParams> {
  name = "";
  isInitialized = false;
  apiVersion = 4;

  events: DdcEvent[] = [];

  async onInit(_args: OnInitArguments<Params>): Promise<void> {}

  async onEvent(_args: OnEventArguments<Params>): Promise<void> {}

  abstract filter({}: FilterArguments<Params>): Promise<Item[]>;

  abstract params(): Params;
}

export function defaultFilterOptions(): FilterOptions {
  return {
    placeholder: undefined,
  };
}
