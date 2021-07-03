import { autocmd, Denops, ensureObject, vars } from "./deps.ts";
import { Ddc } from "./ddc.ts";
import { Context, Custom, defaultDdcOptions } from "./types.ts";

export async function main(denops: Denops) {
  const ddc: Ddc = new Ddc();

  denops.dispatcher = {
    async registerFilter(arg: unknown): Promise<void> {
      ensureObject(arg);

      const dict = arg as Record<string, string>;
      const filter = await import(dict["path"]);
      const name = dict["name"];

      ddc.filters[name] = new filter.Filter();
      ddc.filters[name].name = name;
    },
    async registerSource(arg: unknown): Promise<void> {
      ensureObject(arg);

      const dict = arg as Record<string, string>;
      const source = await import(dict["path"]);
      const name = dict["name"];

      ddc.sources[name] = new source.Source();
      ddc.sources[name].name = name;
    },
    async start(): Promise<void> {
      const input = await denops.call("ddc#get_input", "") as string;
      const custom = await denops.call("ddc#custom#_get") as Custom;
      const userOptions = custom.option;
      const context: Context = {
        input: input,
        candidates: [],
        options: Object.assign(
          defaultDdcOptions,
          userOptions,
        ),
      };
      const candidates = await ddc.gatherCandidates(
        denops,
        context,
      );
      await vars.g.set(denops, "ddc#_candidates", candidates);
      await denops.call("ddc#complete");
    },
  };

  await autocmd.group(denops, "ddc", (helper: autocmd.GroupHelper) => {
    helper.remove("*");
    helper.define(
      ["InsertEnter", "TextChangedI", "TextChangedP"],
      "*",
      `call denops#notify('${denops.name}', 'start', [])`,
    );
  });

  await vars.g.set(denops, "ddc#_candidates", []);
  await vars.g.set(denops, "ddc#_initialized", 1);

  await denops.cmd("doautocmd <nomodeline> User DDCReady");

  console.log(`${denops.name} has loaded`);
}
