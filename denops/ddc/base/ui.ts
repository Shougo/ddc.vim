import { Context, DdcItem, DdcOptions, UiOptions } from "../types.ts";
import { Denops } from "../deps.ts";

export type OnInitArguments<Params extends Record<string, unknown>> = {
  denops: Denops;
  uiOptions: UiOptions;
  uiParams: Params;
};

export type SkipCompletionArguments<
  Params extends Record<string, unknown>,
> = {
  denops: Denops;
  context: Context;
  options: DdcOptions;
  uiOptions: UiOptions;
  uiParams: Params;
};

export type ShowArguments<
  Params extends Record<string, unknown>,
> = {
  denops: Denops;
  context: Context;
  options: DdcOptions;
  completePos: number;
  items: DdcItem[];
  uiOptions: UiOptions;
  uiParams: Params;
};

export type HideArguments<
  Params extends Record<string, unknown>,
> = {
  denops: Denops;
  context: Context;
  options: DdcOptions;
  uiOptions: UiOptions;
  uiParams: Params;
};

export type VisibleArguments<
  Params extends Record<string, unknown>,
> = {
  denops: Denops;
  context: Context;
  options: DdcOptions;
  uiOptions: UiOptions;
  uiParams: Params;
};

export abstract class BaseUi<
  Params extends Record<string, unknown>,
> {
  name = "";
  isInitialized = false;
  apiVersion = 2;

  async onInit(_args: OnInitArguments<Params>): Promise<void> {}

  // deno-lint-ignore require-await
  async skipCompletion(
    _args: SkipCompletionArguments<Params>,
  ): Promise<boolean> {
    return false;
  }

  async show(_args: ShowArguments<Params>): Promise<void> {}

  async hide(_args: HideArguments<Params>): Promise<void> {}

  // deno-lint-ignore require-await
  async visible(_args: VisibleArguments<Params>): Promise<boolean> {
    return true;
  }

  abstract params(): Params;
}

export function defaultUiOptions(): UiOptions {
  return {
    placeholder: undefined,
  };
}
