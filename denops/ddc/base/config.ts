import type { ContextBuilder } from "../context.ts";
import type { DdcExtType } from "../types.ts";
import type { Denops } from "../deps.ts";

export type ConfigArguments = {
  denops: Denops;
  contextBuilder: ContextBuilder;
  setAlias: (extType: DdcExtType, alias: string, base: string) => void;
};

export abstract class BaseConfig {
  apiVersion = 1;

  async config(_args: ConfigArguments): Promise<void> {}
}
