import type {
  BaseParams,
  Context,
  DdcItem,
  DdcOptions,
  UiOptions,
} from "../types.ts";

import type { Denops } from "jsr:@denops/std@~7.1.0";

export type OnInitArguments<Params extends BaseParams> = {
  denops: Denops;
  uiOptions: UiOptions;
  uiParams: Params;
};

export type SkipCompletionArguments<Params extends BaseParams> = {
  denops: Denops;
  context: Context;
  options: DdcOptions;
  uiOptions: UiOptions;
  uiParams: Params;
};

export type ShowArguments<Params extends BaseParams> = {
  denops: Denops;
  context: Context;
  options: DdcOptions;
  completePos: number;
  items: DdcItem[];
  uiOptions: UiOptions;
  uiParams: Params;
};

export type HideArguments<Params extends BaseParams> = {
  denops: Denops;
  context: Context;
  options: DdcOptions;
  uiOptions: UiOptions;
  uiParams: Params;
};

export type VisibleArguments<Params extends BaseParams> = {
  denops: Denops;
  context: Context;
  options: DdcOptions;
  uiOptions: UiOptions;
  uiParams: Params;
};

export abstract class BaseUi<Params extends BaseParams> {
  name = "";
  path = "";
  isInitialized = false;
  apiVersion = 2;

  onInit(_args: OnInitArguments<Params>): void | Promise<void> {}

  skipCompletion(
    _args: SkipCompletionArguments<Params>,
  ): boolean | Promise<boolean> {
    return false;
  }

  show(_args: ShowArguments<Params>): void | Promise<void> {}

  hide(_args: HideArguments<Params>): void | Promise<void> {}

  visible(_args: VisibleArguments<Params>): boolean | Promise<boolean> {
    return true;
  }

  abstract params(): Params;
}

export function defaultUiOptions(): UiOptions {
  return {
    placeholder: undefined,
  };
}
