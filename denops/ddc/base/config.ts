import { ContextBuilder } from "../context.ts";
import { Denops } from "../deps.ts";

export type ConfigArguments = {
  denops: Denops;
  contextBuilder: ContextBuilder;
};

export abstract class BaseConfig {
  apiVersion = 1;

  async config(_args: ConfigArguments): Promise<void> {}
}
