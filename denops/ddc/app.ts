import {
  ensureRecord,
  main,
} from "https://deno.land/x/denops_std@v0.13/mod.ts";
import { BaseSource } from "./base/source.ts";

main(async ({ vim }) => {
  const _sources: BaseSource[] = [];

  vim.register({
    async registerSource(dict: unknown): Promise<void> {
      await ensureRecord(dict, "dict");
      const source = await import(dict["path"]);
      _sources.push(new source.Source());
    },
    async gatherCandidates(): Promise<void> {
      let candidates = [];
      for (const i in _sources) {
        candidates = candidates.concat(
          await _sources[i].gatherCandidates(vim),
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
