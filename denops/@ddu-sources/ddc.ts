import { Context, Item } from "https://deno.land/x/ddu_vim@v3.4.4/types.ts";
import { BaseSource } from "https://deno.land/x/ddu_vim@v3.4.4/base/source.ts";
import { Denops, vars } from "https://deno.land/x/ddu_vim@v3.4.4/deps.ts";
import { DdcItem } from "../ddc/types.ts";

type Params = Record<never, never>;

export type ActionData = {
  text: string;
  item: DdcItem;
};

export class Source extends BaseSource<Params> {
  override kind = "word";

  override gather(args: {
    denops: Denops;
    context: Context;
    sourceParams: Params;
  }): ReadableStream<Item<ActionData>[]> {
    return new ReadableStream({
      async start(controller) {
        const ddcItems = await vars.g.get(
          args.denops,
          "ddc#_items",
          [],
        ) as DdcItem[];

        const items: Item<ActionData>[] = ddcItems
          .map((item) => ({
            word: item.word,
            display: item.abbr,
            action: {
              text: item.word,
              item,
            },
          }));

        controller.enqueue(items);
        controller.close();
      },
    });
  }

  override params(): Params {
    return {};
  }
}
