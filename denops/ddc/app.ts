import { autocmd, batch, Denops, ensureObject, vars } from "./deps.ts";
import { Ddc } from "./ddc.ts";
import { ContextBuilder } from "./context.ts";
import { Context, DdcEvent, DdcOptions } from "./types.ts";

type RegisterArg = {
  path: string;
  name: string;
};

export async function main(denops: Denops) {
  const ddc: Ddc = new Ddc();
  const contextBuilder = new ContextBuilder();

  denops.dispatcher = {
    async registerSource(arg1: unknown): Promise<void> {
      const arg = arg1 as RegisterArg;
      await ddc.registerSource(denops, arg.path, arg.name);
    },
    async registerFilter(arg1: unknown): Promise<void> {
      const arg = arg1 as RegisterArg;
      await ddc.registerFilter(denops, arg.path, arg.name);
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
      return Promise.resolve(contextBuilder.getBuffer());
    },
    async _cacheWorld(arg1: unknown): Promise<unknown> {
      return await contextBuilder._cacheWorld(denops, arg1 as DdcEvent);
    },
    async manualComplete(arg1: unknown): Promise<void> {
      const sources = arg1 as string[];

      const maybe = await contextBuilder.createContext(denops, "Manual");
      if (!maybe) return;
      const [context, options] = maybe;
      if (sources.length != 0) {
        options.sources = sources;
      }

      await doCompletion(denops, context, options);
    },
    async onEvent(arg1: unknown): Promise<void> {
      const event = arg1 as DdcEvent;
      if (event == "InsertLeave") {
        await denops.call("ddc#_clear");
        return;
      }

      const maybe = await contextBuilder.createContext(denops, event);
      if (!maybe) return;
      const [context, options] = maybe;

      await ddc.onEvent(
        denops,
        context,
        options,
      );

      if (
        options.autoCompleteEvents.indexOf(event) < 0 &&
        event != "AutoRefresh" && event != "ManualRefresh"
      ) {
        return;
      }

      await doCompletion(denops, context, options);
    },
  };

  await autocmd.group(denops, "ddc", (helper: autocmd.GroupHelper) => {
    helper.remove("*");
  });
  ddc.registerAutocmd(denops, [
    "InsertEnter",
    "InsertLeave",
    "TextChangedI",
    "TextChangedP",
  ]);

  async function doCompletion(
    denops: Denops,
    context: Context,
    options: DdcOptions,
  ): Promise<void> {
    const [completePos, candidates] = await ddc.gatherResults(
      denops,
      context,
      options,
    );

    await (async function write() {
      const pumvisible = await denops.call("pumvisible");
      await batch(denops, async (denops) => {
        await vars.g.set(denops, "ddc#_event", context.event);
        await vars.g.set(denops, "ddc#_complete_pos", completePos);
        await vars.g.set(denops, "ddc#_candidates", candidates);
        if (
          options.completionMode == "popupmenu" ||
          context.event == "Manual" ||
          context.event == "AutoRefresh" ||
          context.event == "ManualRefresh" ||
          pumvisible
        ) {
          await denops.call("ddc#complete");
        } else if (options.completionMode == "inline") {
          await denops.call("ddc#_inline");
        } else if (options.completionMode == "manual") {
          // through
        }
      });
    })();
  }

  await batch(denops, async (denops) => {
    await vars.g.set(denops, "ddc#_event", "Manual");
    await vars.g.set(denops, "ddc#_complete_pos", -1);
    await vars.g.set(denops, "ddc#_candidates", []);
    await vars.g.set(denops, "ddc#_initialized", 1);
    await vars.g.set(denops, "ddc#_now", 0);

    await denops.cmd("doautocmd <nomodeline> User DDCReady");
  });

  //console.log(`${denops.name} has loaded`);
}
