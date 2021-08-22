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
  apiVersion = 1;

  // Deprecated
  async onInit(_denops: Denops): Promise<void>;

  // New
  async onInit({}: OnInitArguments): Promise<void>;

  async onInit(_args: OnInitArguments | Denops): Promise<void> {}

  // Deprecated
  async onEvent(
    denops: Denops,
    context: Context,
    options: DdcOptions,
    filterOptions: FilterOptions,
    filterParams: Record<string, unknown>,
  ): Promise<void>;

  // New
  async onEvent({}: OnEventArguments): Promise<void>;

  async onEvent(_args: OnInitArguments | Denops): Promise<void> {}

  // Deprecated
  abstract filter(
    denops: Denops,
    context: Context,
    options: DdcOptions,
    sourceOptions: SourceOptions,
    filterOptions: FilterOptions,
    filterParams: Record<string, unknown>,
    completeStr: string,
    candidates: Candidate[],
  ): Promise<Candidate[]>;

  // New
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
