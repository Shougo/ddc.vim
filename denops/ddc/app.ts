import {
  ensureRecord,
  main,
} from "https://deno.land/x/denops_std@v0.13/mod.ts";
import { BaseSource } from "./base/source.ts";
import { BaseFilter } from "./base/filter.ts";

main(async ({ vim }) => {
  const _sources: Record<string, BaseSource> = [];
  const _filters: Record<string, BaseFilter> = [];

  vim.register({
    async registerFilter(dict: unknown): Promise<void> {
      await ensureRecord(dict, "dict");
      const filter = await import(dict["path"]);
      const name = dict["name"];
      _filters[name] = new filter.Filter();
      _filters[name].name = name;
    },
    async registerSource(dict: unknown): Promise<void> {
      await ensureRecord(dict, "dict");
      const source = await import(dict["path"]);
      const name = dict["name"];
      _sources[name] = new source.Source();
      _sources[name].name = name;
    },
    async gatherCandidates(): Promise<void> {
      let candidates: Candidate[] = [];
      for (const key in _sources) {
        candidates = candidates.concat(
          await _sources[key].gatherCandidates(vim),
        );
      }

      await vim.g.set("ddc#_candidates", candidates);
      await vim.call("ddc#complete");
    },
  });

  await vim.autocmd("ddc", (helper) => {
    helper.define(
      "InsertEnter,TextChangedI,TextChangedP",
      "*",
      `call denops#notify('${vim.name}', 'gatherCandidates', [])`,
    );
  });

  await vim.g.set("ddc#_candidates", []);
  await vim.g.set("ddc#_initialized", 1);

  await vim.cmd("doautocmd <nomodeline> User DDCReady");

  console.log(`${vim.name} has loaded`);
});
