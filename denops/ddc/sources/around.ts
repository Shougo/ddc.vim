import { BaseSource } from "../base/source.ts";
import { Candidate } from "../types.ts";
import { Denops } from "../deps.ts";
import { imap, range } from "https://deno.land/x/itertools@v0.1.2/mod.ts";

export function splitPages(
  maxLines: number,
  size: number,
): Iterable<[number, number]> {
  return imap(
    range(1, /* < */ maxLines + 1, size),
    (lnum: number) => [lnum, /* <= */ lnum + size - 1],
  );
}

export function allWords(lines: string[]): string[] {
  return lines.flatMap((line) => [...line.matchAll(/[a-zA-Z0-9_]+/g)])
    .map((match) => match[0]);
}

export class Source extends BaseSource {
  async gatherCandidates(denops: Denops): Promise<Candidate[]> {
    const pageSize = 500;
    const maxLines = (await denops.call("line", "$")) as number;
    const pages = (await Promise.all(
      imap(
        splitPages(maxLines, pageSize),
        ([start, end]: [number, number]) => denops.call("getline", start, end),
      ),
    )) as string[][];
    const lines = pages.flatMap((page) => page);

    const candidates: Candidate[] = allWords(lines).map((word) => ({ word }));
    return candidates;
  }
}
