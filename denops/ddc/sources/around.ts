import { BaseSource, Candidate, Context, SourceOptions } from "../types.ts";
import { Denops } from "../deps.ts";
import { imap, range } from "https://deno.land/x/itertools@v0.1.2/mod.ts";
import { assertEquals } from "https://deno.land/std@0.98.0/testing/asserts.ts";

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

function allWords(lines: string[]): string[] {
  return lines.flatMap((line) => [...line.matchAll(/[a-zA-Z0-9_]+/g)])
    .map((match) => match[0]);
}

interface Params {
  maxSize: number;
}

export class Source extends BaseSource {
  async gatherCandidates(
    denops: Denops,
    _context: Context,
    _options: SourceOptions,
    params: Record<string, unknown>,
  ): Promise<Candidate[]> {
    const pageSize = 500;
    const p = params as unknown as Params;
    const maxSize = p.maxSize;
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
    const lines = pages.flatMap((page) => page);

    const candidates: Candidate[] = allWords(lines).map((word) => ({ word }));
    return candidates;
  }

  params(): Record<string, unknown> {
    const params: Params = {
      maxSize: 200,
    };
    return params as unknown as Record<string, unknown>;
  }
}

Deno.test("pages", () => {
  assertEquals(Array.from(splitPages(1, 600, 500)), [[1, 500], [501, 1000]]);
  assertEquals(Array.from(splitPages(1, 1, 500)), [[1, 500]]);
  assertEquals(Array.from(splitPages(1, 500, 500)), [[1, 500]]);
  assertEquals(Array.from(splitPages(1, 501, 500)), [[1, 500], [501, 1000]]);
});

Deno.test("allWords", () => {
  assertEquals(allWords([]), []);
  assertEquals(allWords(["_w2er"]), ["_w2er"]);
  assertEquals(allWords(["asdf _w2er", "223r wawer"]), [
    "asdf",
    "_w2er",
    "223r",
    "wawer",
  ]);
});
