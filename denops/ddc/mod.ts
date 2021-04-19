import { main } from "https://deno.land/x/denops_std@v0.8/mod.ts";

main(async ({ vim }) => {
    vim.register({
        async gatherCandidates(): Promise<void> {
            const candidates = [];
            let lines = [];

            const count = 500;
            for (let i = 1; i <= await vim.call("line", "$"); i += count) {
                lines = await vim.call(
                    "getline", i, i + count) as string[];
                lines.forEach(line => {
                    [...line.matchAll(/[a-zA-Z0-9_]+/g)].forEach(match => {
                        candidates.push(match[0]);
                    });
                });
            }
            await vim.g.set("ddc#_candidates", candidates);
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
