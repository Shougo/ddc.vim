import {
  BaseFilter,
  Candidate,
  Context,
  DdcOptions,
  FilterOptions,
} from "../types.ts";
import { Denops } from "../deps.ts";
import { imap, range } from "https://deno.land/x/itertools@v0.1.2/mod.ts";

function splitPages(
  minLines: number,
  maxLines: number,
  size: number,
): Iterable<[number, number]> {
  return imap(
    range(minLines, /* < */ maxLines + 1, size),
    (lnum: number) => [lnum, /* <= */ lnum + size - 1],
  );
}

const LINES_MAX = 150;

export class Filter extends BaseFilter {
  _cache: Record<string, number> = {};

  async onEvent(
    denops: Denops,
    _context: Context,
    _options: DdcOptions,
    _filterOptions: FilterOptions,
    _filterParams: Record<string, unknown>,
  ): Promise<void> {
    const pageSize = 500;
    const maxSize = LINES_MAX;
    const currentLine = (await denops.call("line", ".")) as number;
    const minLines = Math.max(1, currentLine - maxSize);
    const maxLines = Math.min(
      (await denops.call("line", "$")) as number,
      currentLine + maxSize,
    );
    const pages = (await Promise.all(
      imap(
        splitPages(minLines, maxLines, pageSize),
        ([start, end]: [number, number]) => denops.call("getline", start, end),
      ),
    )) as string[][];

    let linenr = minLines;
    for (const line of pages.flatMap((page) => page)) {
      for (const match of line.matchAll(/[a-zA-Z0-9_]+/g)) {
        const word = match[0].toLowerCase();
        if (
          word in this._cache &&
          Math.abs(this._cache[word] - currentLine) >=
            Math.abs(linenr - currentLine)
        ) {
          continue;
        }
        this._cache[match[0]] = linenr;
      }
      linenr += 1;
    }
  }

  async filter(
    denops: Denops,
    context: Context,
    _options: DdcOptions,
    _filterOptions: FilterOptions,
    _filterParams: Record<string, unknown>,
    candidates: Candidate[],
  ): Promise<Candidate[]> {
    const match = context.input.toLowerCase().match(/\w*$/);
    const completeStr = match ? match[0] : "";
    const linenr = (await denops.call("line", ".")) as number;
    const cache = this._cache;

    return Promise.resolve(candidates.sort((a, b) => {
      function compare(x: Candidate): number {
        const lower = x.word.toLowerCase();
        const matched = lower.indexOf(completeStr);
        let score = -matched * 40;

        if (lower in cache) {
          const mru = Math.abs(cache[lower] - linenr) - LINES_MAX;
          score += mru * 10;
        }

        return score;
      }
      return compare(a) - compare(b);
    }));
  }
}
