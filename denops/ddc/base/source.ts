import { Candidate } from "../types.ts";

export class BaseSource {
  name: string;
  abstract gatherCandidates(vim: Any): Candidate[];
}
