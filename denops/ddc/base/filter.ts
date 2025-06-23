import type {
  BaseParams,
  Context,
  DdcEvent,
  DdcOptions,
  FilterOptions,
  Item,
  OnCallback,
  SourceOptions,
} from "../types.ts";

import type { Denops } from "jsr:@denops/std@~7.6.0";

export type OnInitArguments<Params extends BaseParams> = {
  denops: Denops;
  filterOptions: FilterOptions;
  filterParams: Params;
};

type BaseFilterArguments<Params extends BaseParams> = {
  denops: Denops;
  context: Context;
  options: DdcOptions;
  filterOptions: FilterOptions;
  filterParams: Params;
};

export type OnEventArguments<Params extends BaseParams> =
  & BaseFilterArguments<Params>
  & {
    onCallback: OnCallback;
  };

export type FilterArguments<Params extends BaseParams> =
  & BaseFilterArguments<Params>
  & {
    onCallback: OnCallback;
    sourceOptions: SourceOptions;
    completeStr: string;
    items: Item[];
  };

export abstract class BaseFilter<Params extends BaseParams> {
  name = "";
  path = "";
  isInitialized = false;
  apiVersion = 4;

  events: DdcEvent[] = [];

  onInit(_args: OnInitArguments<Params>): void | Promise<void> {}

  onEvent(_args: OnEventArguments<Params>): void | Promise<void> {}

  abstract filter({}: FilterArguments<Params>): Item[] | Promise<Item[]>;

  abstract params(): Params;
}

export function defaultFilterOptions(): FilterOptions {
  return {
    placeholder: undefined,
  };
}
