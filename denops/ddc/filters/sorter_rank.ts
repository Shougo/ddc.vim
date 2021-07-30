import {
  BaseFilter,
  Candidate,
  Context,
  DdcOptions,
  FilterOptions,
} from "../types.ts";
import { assertEquals, Denops } from "../deps.ts";
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

function calcScore(
  str: string,
  completeStr: string,
  cache: Record<string, number>,
  linenr: number,
): number {
  let score = 0;
  if (str.indexOf(completeStr) == 0) {
    score += 100;
  } else if (str.toLowerCase().indexOf(completeStr.toLowerCase()) == 0) {
    score += 30;
  }
  score -= str.length * 2;

  if (str in cache) {
    score += LINES_MAX - Math.abs(cache[str] - linenr);
  }

  return score;
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
        const word = match[0];
        if (
          word in this._cache &&
          Math.abs(this._cache[word] - currentLine) >=
            Math.abs(linenr - currentLine)
        ) {
          continue;
        }
        this._cache[word] = linenr;
      }
      linenr += 1;
    }
  }

  async filter(
    denops: Denops,
    _context: Context,
    _options: DdcOptions,
    _filterOptions: FilterOptions,
    _filterParams: Record<string, unknown>,
    completeStr: string,
    candidates: Candidate[],
  ): Promise<Candidate[]> {
    const linenr = (await denops.call("line", ".")) as number;

    return Promise.resolve(candidates.sort((a, b) => {
      return calcScore(b.word, completeStr, this._cache, linenr) -
        calcScore(a.word, completeStr, this._cache, linenr);
    }));
  }
}

Deno.test("calcScore", () => {
  assertEquals(calcScore("", "", {}, 0), 100);
});
