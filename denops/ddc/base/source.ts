export class BaseSource {
  name: string;
  abstract gatherCandidates(vim: Any): string[];
}
