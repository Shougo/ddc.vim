import {
  BaseSource,
  Candidate,
  Context,
  DdcOptions,
  SourceOptions,
} from "../types.ts";
import { assertEquals, batch, Denops, fn } from "../deps.ts";
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

function allWords(lines: string[]): string[] {
  return lines.flatMap((line) => [...line.matchAll(/[a-zA-Z0-9_]+/g)])
    .map((match) => match[0]);
}

type Params = {
  maxSize: number;
};

export class Source extends BaseSource {
  async gatherCandidates(
    denops: Denops,
    _context: Context,
    _ddcOptions: DdcOptions,
    _sourceOptions: SourceOptions,
    sourceParams: Record<string, unknown>,
  ): Promise<Candidate[]> {
    const pageSize = 500;
    const p = sourceParams as unknown as Params;
    const maxSize = p.maxSize;
    const currentLine = await fn.line(denops, ".");
    const minLines = Math.max(1, currentLine - maxSize);
    const maxLines = Math.min(
      await fn.line(denops, "$"),
      currentLine + maxSize,
    );
    const ps = await batch(denops, (helper) => {
      for (const [s, e] of splitPages(minLines, maxLines, pageSize)) {
        fn.getline(helper, s, e);
      }
    }) as string[][];
    const cs: Candidate[] = [
      ...new Set(allWords(ps.flatMap((p) => p)).map((word) => ({ word }))),
    ];
    return cs;
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
