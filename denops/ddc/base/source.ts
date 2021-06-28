import { Candidate } from "../types.ts";
import { Vim } from "../deps.ts";

export abstract class BaseSource {
  name = "";

  abstract gatherCandidates(vim: Vim): Promise<Candidate[]>;
}
