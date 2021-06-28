import { Candidate } from "../types.ts";
import { Denops } from "../deps.ts";

export abstract class BaseSource {
  name = "";

  abstract gatherCandidates(denops: Denops): Promise<Candidate[]>;
}
