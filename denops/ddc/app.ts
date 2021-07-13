import { autocmd, Denops, ensureObject, vars } from "./deps.ts";
import { Ddc } from "./ddc.ts";
import { ContextBuilder } from "./context.ts";
import { DdcOptions } from "./types.ts";

type RegisterArg = {
  path: string;
  name: string;
};

export async function main(denops: Denops) {
  const ddc: Ddc = new Ddc();
  const contextBuilder = new ContextBuilder();

  denops.dispatcher = {
    async registerFilter(arg1: unknown): Promise<void> {
      const arg = arg1 as RegisterArg;
      await ddc.registerFilter(arg.path, arg.name);
    },
    async registerSource(arg1: unknown): Promise<void> {
      const arg = arg1 as RegisterArg;
      await ddc.registerSource(arg.path, arg.name);
    },
    patchGlobal(arg1: unknown): Promise<void> {
      ensureObject(arg1);
      const options = arg1 as Record<string, unknown>;
      contextBuilder.patchGlobal(options);
      return Promise.resolve();
    },
    patchFiletype(arg1: unknown, arg2: unknown): Promise<void> {
      const filetype = arg1 as string;
      ensureObject(arg2);
      const options = arg2 as Record<string, unknown>;
      contextBuilder.patchFiletype(filetype, options);
      return Promise.resolve();
    },
    patchBuffer(arg1: unknown, arg2: unknown): Promise<void> {
      const bufnr = arg1 as number;
      ensureObject(arg2);
      const options = arg2 as Record<string, unknown>;
      contextBuilder.patchBuffer(bufnr, options);
      return Promise.resolve();
    },
    getGlobal(): Promise<Partial<DdcOptions>> {
      return Promise.resolve(contextBuilder.getGlobal());
    },
    getFiletype(): Promise<Record<string, Partial<DdcOptions>>> {
      return Promise.resolve(contextBuilder.getFiletype());
    },
    getBuffer(): Promise<Record<number, Partial<DdcOptions>>> {
      return Promise.resolve(contextBuilder.getFiletype());
    },
    async _cacheWorld(arg1: unknown): Promise<unknown> {
      return await contextBuilder._cacheWorld(denops, arg1 as string);
    },
    async onEvent(arg1: unknown): Promise<void> {
      const event = arg1 as string;
      const maybe = await contextBuilder.createContext(denops, event);
      if (!maybe) return;
      const [context, options] = maybe;
      const candidates = await ddc.gatherCandidates(denops, context, options);
      const matchPos = context.input.search(/\w*$/);
      const completePos = matchPos != null ? matchPos : -1;

      await (async function write() {
        await Promise.all([
          vars.g.set(denops, "ddc#_complete_pos", completePos),
          vars.g.set(denops, "ddc#_candidates", candidates),
        ]);
        if (options.completionMode == "popupmenu") {
          await denops.call("ddc#complete");
        } else if (options.completionMode == "virtual") {
          await denops.call("ddc#_virtual");
        }
      })();
    },
  };

  await autocmd.group(denops, "ddc", (helper: autocmd.GroupHelper) => {
    helper.remove("*");
    helper.define(
      "InsertEnter",
      "*",
      `call denops#notify('${denops.name}', 'onEvent', ["InsertEnter"])`,
    );
    helper.define(
      "TextChangedI",
      "*",
      `call denops#notify('${denops.name}', 'onEvent', ["TextChangedI"])`,
    );
    helper.define(
      "TextChangedP",
      "*",
      `call denops#notify('${denops.name}', 'onEvent', ["TextChangedP"])`,
    );
  });

  await vars.g.set(denops, "ddc#_complete_pos", -1);
  await vars.g.set(denops, "ddc#_candidates", []);
  await vars.g.set(denops, "ddc#_initialized", 1);

  await denops.cmd("doautocmd <nomodeline> User DDCReady");

  //console.log(`${denops.name} has loaded`);
}
