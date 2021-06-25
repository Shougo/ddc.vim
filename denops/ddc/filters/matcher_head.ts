import { BaseFilter } from "../base/filter.ts";
import { Candidate, Context } from "../types.ts";
import { Vim } from "../deps.ts";

export class Filter implements BaseFilter {
  async filter(_vim: Vim, context: Context): Candidate[] {
    const completeStr = context.input.match(/\w*$/);
    const candidates = context.candidates.filter(
      (candidate) => candidate.word.indexOf(completeStr) == 0,
    );
    return await candidates;
  }
}
