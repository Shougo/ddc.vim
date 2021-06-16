import { main } from "https://deno.land/x/denops_std@v0.13/mod.ts";
import { Source } from "./sources/around.ts";

main(async ({ vim }) => {
    vim.register({
        async gatherCandidates(): Promise<void> {
            source = Source()
            await vim.g.set("ddc#_candidates", source.gather_candidates(vim));
        }
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

    console.log(`${vim.name} has loaded`);
});
