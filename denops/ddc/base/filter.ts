import { Candidate, Context } from "../types.ts";
import { Vim } from "../deps.ts";

export abstract class BaseFilter {
  name = "";

  abstract filter(vim: Vim, context: Context): Promise<Candidate[]>;
}
