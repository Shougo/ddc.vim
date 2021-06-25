import {
  ensureRecord,
  main,
} from "https://deno.land/x/denops_std@v0.13/mod.ts";
import { Ddc } from "./ddc.ts";

main(async ({ vim }) => {
  const ddc: Ddc = new Ddc();

  vim.register({
    async registerFilter(dict: unknown): Promise<void> {
      await ensureRecord(dict, "dict");
      const filter = await import(dict["path"]);
      const name = dict["name"];

      ddc.filters[name] = new filter.Filter();
      ddc.filters[name].name = name;
    },
    async registerSource(dict: unknown): Promise<void> {
      await ensureRecord(dict, "dict");
      const source = await import(dict["path"]);
      const name = dict["name"];

      console.log(ddc);
      ddc.sources[name] = new source.Source();
      ddc.sources[name].name = name;
      console.log(ddc.sources);
    },
    async start(): Promise<void> {
      const candidates = await ddc.filterCandidates(
        vim,
        await ddc.gatherCandidates(vim),
      );
      await vim.g.set("ddc#_candidates", candidates);
      await vim.call("ddc#complete");
    },
  });

  await vim.autocmd("ddc", (helper) => {
    helper.define(
      "InsertEnter,TextChangedI,TextChangedP",
      "*",
      `call denops#notify('${vim.name}', 'start', [])`,
    );
  });

  await vim.g.set("ddc#_candidates", []);
  await vim.g.set("ddc#_initialized", 1);

  await vim.cmd("doautocmd <nomodeline> User DDCReady");

  console.log(`${vim.name} has loaded`);
});
