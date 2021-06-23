import { Candidate, Context } from "../types.ts";

export class BaseFilter {
  name: string;
  abstract filter(vim: Any, context: Context): Candidate[];
}
