import { autocmd, Denops, vars } from "./deps.ts";
import { Ddc } from "./ddc.ts";
import { Context, Custom, defaultDdcOptions } from "./types.ts";

interface RegisterArg {
  path: string;
  name: string;
}

export async function main(denops: Denops) {
  const ddc: Ddc = new Ddc();
  let lastInput = "";

  denops.dispatcher = {
    async registerFilter(arg1: unknown): Promise<void> {
      const arg = arg1 as RegisterArg;
      const filter = await import(arg.path);
      const name = arg.name;

      ddc.filters[name] = new filter.Filter();
      ddc.filters[name].name = name;
    },
    async registerSource(arg1: unknown): Promise<void> {
      const arg = arg1 as RegisterArg;
      const source = await import(arg.path);
      const name = arg.name;

      const custom = await denops.call("ddc#custom#_get") as Custom;
      const currentOptions = "_" in custom.source ? custom.source._ : {};

      const newSource = new source.Source();
      newSource.name = name;
      newSource.options = Object.assign(
        newSource.options,
        currentOptions,
      );

      ddc.sources[name] = newSource;
    },
    async start(arg: unknown): Promise<void> {
      const event = arg as string;
      const input = await denops.call("ddc#get_input", "") as string;
      const completedItem = await vars.v.get(
        denops,
        "completed_item",
      ) as Record<string, unknown>;

      if (
        input == lastInput ||
        (event == "TextChangedP" && Object.keys(completedItem).length != 0)
      ) {
        return;
      }

      // Skip for iminsert
      const iminsert = await denops.call('getbufvar', '%', '&iminsert');
      if (iminsert == 1) {
        return;
      }

      lastInput = input;

      const custom = await denops.call("ddc#custom#_get") as Custom;
      const userOptions = custom.option;
      const context: Context = {
        input: input,
        options: Object.assign(
          defaultDdcOptions,
          userOptions,
        ),
      };
      const candidates = await ddc.gatherCandidates(
        denops,
        context,
      );

      const matchPos = context.input.search(/\w*$/);

      await vars.g.set(
        denops,
        "ddc#_complete_pos",
        matchPos != null ? matchPos : -1,
      );
      await vars.g.set(denops, "ddc#_candidates", candidates);
      await denops.call("ddc#complete");
    },
  };

  await autocmd.group(denops, "ddc", (helper: autocmd.GroupHelper) => {
    helper.remove("*");
    helper.define(
      "InsertEnter",
      "*",
      `call denops#notify('${denops.name}', 'start', ["InsertEnter"])`,
    );
    helper.define(
      "TextChangedI",
      "*",
      `call denops#notify('${denops.name}', 'start', ["TextChangedI"])`,
    );
    helper.define(
      "TextChangedP",
      "*",
      `call denops#notify('${denops.name}', 'start', ["TextChangedP"])`,
    );
  });

  await vars.g.set(denops, "ddc#_complete_pos", -1);
  await vars.g.set(denops, "ddc#_candidates", []);
  await vars.g.set(denops, "ddc#_initialized", 1);

  await denops.cmd("doautocmd <nomodeline> User DDCReady");

  //console.log(`${denops.name} has loaded`);
}
