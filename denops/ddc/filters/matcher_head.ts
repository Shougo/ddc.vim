import {
  BaseFilter,
  Candidate,
  Context,
  DdcOptions,
  FilterOptions,
} from "../types.ts";
import { Denops } from "../deps.ts";

export class Filter extends BaseFilter {
  filter(
    _denops: Denops,
    _context: Context,
    _options: DdcOptions,
    _filterOptions: FilterOptions,
    _filterParams: Record<string, unknown>,
    completeStr: string,
    candidates: Candidate[],
  ): Promise<Candidate[]> {
    const filtered = candidates.filter(
      (candidate) => candidate.word.startsWith(completeStr),
    );
    return Promise.resolve(filtered);
  }
}
