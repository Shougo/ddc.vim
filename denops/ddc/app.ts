import { autocmd, Denops, ensureObject, vars } from "./deps.ts";
import { Ddc } from "./ddc.ts";
import { ContextBuilder } from "./context.ts";

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
    customizeGlobal(arg1: unknown): Promise<void> {
      ensureObject(arg1);
      const options = arg1 as Record<string, unknown>;
      contextBuilder.customizeGlobal(options);
      return Promise.resolve();
    },
    customizeFiletype(arg1: unknown, arg2: unknown): Promise<void> {
      const filetype = arg1 as string;
      ensureObject(arg2);
      const options = arg2 as Record<string, unknown>;
      contextBuilder.customizeFiletype(filetype, options);
      return Promise.resolve();
    },
    customizeBuffer(arg1: unknown, arg2: unknown): Promise<void> {
      const bufnr = arg1 as number;
      ensureObject(arg2);
      const options = arg2 as Record<string, unknown>;
      contextBuilder.customizeBuffer(bufnr, options);
      return Promise.resolve();
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
        await denops.call("ddc#complete");
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
