import { Base } from "../base/source.ts";

export class Source implements Base {
  name = "around";
  gather_candidates(vim: Any): AsyncIterableIterator<string> {
    const candidates = [];
    let lines = [];

    const count = 500;
    for (let i = 1; i <= await vim.call("line", "$"); i += count) {
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
