export class Base {
  name: string;
  abstract gather_candidates(vim: Any): AsyncIterableIterator<string>;
}
