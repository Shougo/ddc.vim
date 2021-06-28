import { BaseFilter } from "../base/filter.ts";
import { Candidate, Context } from "../types.ts";
import { Denops } from "../deps.ts";

export class Filter extends BaseFilter {
  filter(_denops: Denops, context: Context): Promise<Candidate[]> {
    const completeStr = context.input.match(/\w*$/);
    const candidates = context.candidates.filter(
      (candidate) => candidate.word.indexOf(completeStr) == 0,
    );
    return Promise.resolve(candidates);
  }
}
