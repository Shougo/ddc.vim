import { BaseFilter } from "../base/filter.ts";
import { Candidate, Context } from "../types.ts";

export class Filter implements BaseFilter {
  async filter(_vim: Any, context: Context): Candidate[] {
    const completeStr = context.input.match(/\w*$/);
    const candidates = context.candidates.filter(
      (candidate) => candidate.word.indexOf(completeStr) == 0,
    );
    return await candidates;
  }
}
