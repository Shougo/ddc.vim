import { BaseSource } from "../base/source.ts";
import { Candidate } from "../types.ts";
import { Denops } from "../deps.ts";

export class Source extends BaseSource {
  async gatherCandidates(denops: Denops): Promise<Candidate[]> {
    const candidates: Candidate[] = [];
    let lines: string[] = [];

    const count = 500;
    const maxLines = (await denops.call("line", "$")) as number;
    for (let i = 1; i <= maxLines; i += count) {
      lines = await denops.call(
        "getline",
        i,
        i + count,
      ) as string[];
      lines.forEach((line) => {
        [...line.matchAll(/[a-zA-Z0-9_]+/g)].forEach((match) => {
          candidates.push({ word: match[0] });
        });
      });
    }

    return candidates;
  }
}
