import { Context, DdcItem, DdcOptions, UiOptions } from "../types.ts";
import { Denops } from "../deps.ts";

export type BaseUiParams = Record<string, unknown>;

export type OnInitArguments<Params extends BaseUiParams> = {
  denops: Denops;
  uiOptions: UiOptions;
  uiParams: Params;
};

export type SkipCompletionArguments<Params extends BaseUiParams> = {
  denops: Denops;
  context: Context;
  options: DdcOptions;
  uiOptions: UiOptions;
  uiParams: Params;
};

export type ShowArguments<Params extends BaseUiParams> = {
  denops: Denops;
  context: Context;
  options: DdcOptions;
  completePos: number;
  items: DdcItem[];
  uiOptions: UiOptions;
  uiParams: Params;
};

export type HideArguments<Params extends BaseUiParams> = {
  denops: Denops;
  context: Context;
  options: DdcOptions;
  uiOptions: UiOptions;
  uiParams: Params;
};

export type VisibleArguments<Params extends BaseUiParams> = {
  denops: Denops;
  context: Context;
  options: DdcOptions;
  uiOptions: UiOptions;
  uiParams: Params;
};

export abstract class BaseUi<Params extends BaseUiParams> {
  name = "";
  isInitialized = false;
  apiVersion = 2;

  async onInit(_args: OnInitArguments<Params>): Promise<void> {}

  skipCompletion(
    _args: SkipCompletionArguments<Params>,
  ): Promise<boolean> {
    return Promise.resolve(false);
  }

  async show(_args: ShowArguments<Params>): Promise<void> {}

  async hide(_args: HideArguments<Params>): Promise<void> {}

  visible(_args: VisibleArguments<Params>): Promise<boolean> {
    return Promise.resolve(true);
  }

  abstract params(): Params;
}

export function defaultUiOptions(): UiOptions {
  return {
    placeholder: undefined,
  };
}
