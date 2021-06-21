import { main, ensureRecord } from "https://deno.land/x/denops_std@v0.13/mod.ts";
import { Source } from "./sources/around.ts";

main(async ({ vim }) => {
  let sources: Source[] = [];

  vim.register({
    async gatherCandidates(): Promise<void> {
      const source = new Source();
      const candidates = await source.gather_candidates(vim);
      await vim.g.set("ddc#_candidates", candidates);
    },
    async registerSource(source: unknown): Promise<void> {
      ensureRecord(source, "source");
    },
  });

  await vim.autocmd("ddc", (helper) => {
    helper.remove("*", "");
    helper.define(
      "InsertEnter,TextChangedI",
      "*",
      "call ddc#complete()",
    );
    helper.define(
      "TextChanged,TextChangedI",
      "*",
      `call denops#request('${vim.name}', 'gatherCandidates', [])`,
    );
  });

  await vim.g.set("ddc#_candidates", []);
  await vim.g.set("ddc#_initialized", 1);

  console.log(`${vim.name} has loaded`);
});
