import { BaseSource } from "../base/source.ts";

export class Source implements BaseSource {
  async gatherCandidates(vim: Any): string[] {
    const candidates = [];
    let lines = [];

    const count = 500;
    const maxLines = await vim.call("line", "$");
    for (let i = 1; i <= maxLines; i += count) {
      lines = await vim.call(
        "getline",
        i,
        i + count,
      ) as string[];
      lines.forEach((line) => {
        [...line.matchAll(/[a-zA-Z0-9_]+/g)].forEach((match) => {
          candidates.push(match[0]);
        });
      });
    }

    return candidates;
  }
}
