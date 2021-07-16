import { BaseFilter, Candidate, Context, FilterOptions } from "../types.ts";
import { Denops } from "../deps.ts";

const _LINES_MAX = 150;

export class Filter extends BaseFilter {
  filter(
    denops: Denops,
    context: Context,
    _options: FilterOptions,
    _params: Record<string, unknown>,
    candidates: Candidate[],
  ): Promise<Candidate[]> {
    const match = context.input.toLowerCase().match(/\w*$/);
    const completeStr = match ? match[0] : "";
    const _linenr = denops.call("line", ".");

    return Promise.resolve(candidates.sort((a, b) => {
      function compare(x: Candidate): number {
        const lower = x.word.toLowerCase();
        const matched = lower.indexOf(completeStr);
        const score = -matched * 40;
        return score;
      }
      return compare(a) - compare(b);
    }));
  }
}
