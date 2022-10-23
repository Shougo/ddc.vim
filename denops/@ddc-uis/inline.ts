import { Context, DdcItem } from "../ddc/types.ts";
import { BaseUi } from "../ddc/base/ui.ts";
import { Denops } from "../ddc/deps.ts";

export type Params = {
  highlight: string;
};

export class Ui extends BaseUi<Params> {
  async show(args: {
    denops: Denops;
    context: Context;
    completePos: number;
    items: DdcItem[];
    uiParams: Params;
  }): Promise<void> {
    await args.denops.call(
      "ddc#ui#inline#_show",
      args.completePos,
      args.items,
      args.uiParams.highlight,
    );
  }

  async hide(args: {
    denops: Denops;
  }): Promise<void> {
    await args.denops.call("ddc#ui#inline#_hide");
  }

  params(): Params {
    return {
      highlight: "Comment",
    };
  }
}
