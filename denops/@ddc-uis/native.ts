import {
  Context,
  DdcItem,
} from "../ddc/types.ts";
import {
  BaseUi,
} from "../ddc/base/ui.ts";
import { Denops, fn } from "../ddc/deps.ts";

export type Params = {
  overwriteCompleteopt: boolean;
};

export class Ui extends BaseUi<Params> {
  async complete(args: {
    denops: Denops;
    context: Context;
    completePos: number;
    items: DdcItem[];
    uiParams: Params;
  }): Promise<void> {
    await args.denops.call(
      "ddc#ui#native#_complete",
      args.context.event != "Manual" && args.uiParams.overwriteCompleteopt,
      args.completePos,
      args.items,
    );
  }

  async clear(args: {
    denops: Denops;
  }): Promise<void> {
    const mode = await fn.mode(args.denops);

    if (mode == "i") {
      await fn.complete(args.denops, 1, []);
    }

    await args.denops.call("ddc#ui#native#_restore_completeopt");
  }

  params(): Params {
    return {
      overwriteCompleteopt: true,
    };
  }
}
