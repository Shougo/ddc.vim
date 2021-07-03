import { Candidate, defaultSourceOptions } from "../types.ts";
import { Denops } from "../deps.ts";

export abstract class BaseSource {
  name = "";
  options = defaultSourceOptions;
  vars = {};

  abstract gatherCandidates(denops: Denops): Promise<Candidate[]>;
}
