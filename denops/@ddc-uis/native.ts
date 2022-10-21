import { Context, DdcItem, DdcOptions } from "../ddc/types.ts";
import { BaseUi } from "../ddc/base/ui.ts";
import { autocmd, Denops, fn, op, vars } from "../ddc/deps.ts";

export type Params = {
  overwriteCompleteopt: boolean;
};

export class Ui extends BaseUi<Params> {
  async onInit(args: {
    denops: Denops;
  }) {
    await autocmd.group(
      args.denops,
      "ddc-ui-native",
      (helper: autocmd.GroupHelper) => {
        helper.define(
          "CompleteDone",
          "*",
          "call ddc#ui#native#_on_complete_done()",
        );
      },
    );
  }

  async skipComplete(args: {
    denops: Denops;
  }): Promise<boolean> {
    // Check for CompleteDone
    return await vars.g.get(
      args.denops,
      "ddc#ui#native#_skip_complete",
      false,
    ) as boolean;
  }

  async show(args: {
    denops: Denops;
    context: Context;
    options: DdcOptions;
    completePos: number;
    items: DdcItem[];
    uiParams: Params;
  }): Promise<void> {
    // Check indentkeys.
    // Note: re-indentation does not work for native popupmenu
    const indentkeys = (await op.indentkeys.getLocal(args.denops)).split(",");
    const mode = await fn.mode(args.denops);
    if (
      mode == "i" &&
      indentkeys.filter((pattern) => pattern == "!^F").length > 0
    ) {
      for (
        const found of indentkeys.map((p) => p.match(/^0?=~?(.+)$/))
      ) {
        if (!found) {
          continue;
        }

        if (args.context.input.endsWith(found[1])) {
          // Skip completion and reindent if matched.
          await fn.feedkeys(args.denops, "\\<C-f>", "n");
          return;
        }
      }
    }

    await args.denops.call(
      "ddc#ui#native#_show",
      args.context.event != "Manual" && args.uiParams.overwriteCompleteopt,
      args.completePos,
      args.items,
    );
  }

  async hide(args: {
    denops: Denops;
  }): Promise<void> {
    await args.denops.call("ddc#ui#native#_hide");
  }

  params(): Params {
    return {
      overwriteCompleteopt: true,
    };
  }
}
