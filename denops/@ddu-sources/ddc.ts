import type { Context, Item } from "jsr:@shougo/ddu-vim@9.3.0/types";
import { BaseSource } from "jsr:@shougo/ddu-vim@9.3.0/source";
import type { DdcItem } from "../ddc/types.ts";

import type { Denops } from "jsr:@denops/std@~7.4.0";
import * as vars from "jsr:@denops/std@~7.4.0/variable";

type Params = Record<string, never>;

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
