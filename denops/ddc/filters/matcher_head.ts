import { BaseFilter } from "../base/filter.ts";
import { Candidate, Context } from "../types.ts";

export class Filter implements BaseFilter {
  async filter(_vim: Any, context: Context): Candidate[] {
    const candidates = context.candidates;
    return await candidates;
  }
}
