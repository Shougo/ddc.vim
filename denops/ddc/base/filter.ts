import { Candidate, Context } from "../types.ts";
import { Denops } from "../deps.ts";

export abstract class BaseFilter {
  name = "";

  abstract filter(denops: Denops, context: Context): Promise<Candidate[]>;
}
