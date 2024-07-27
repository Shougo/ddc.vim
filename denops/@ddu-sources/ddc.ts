import type {
  Context,
  Item,
} from "jsr:@shougo/ddu-vim@v5.0.0-pre7/types";
import { BaseSource } from "jsr:@shougo/ddu-vim@v5.0.0-pre7/source";
import { type Denops, vars } from "jsr:@shougo/ddu-vim@v5.0.0-pre7/deps";
import type { DdcItem } from "../ddc/types.ts";

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
