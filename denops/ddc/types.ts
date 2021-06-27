export class Candidate {
  word = "";
  abbr = "";
  menu = "";
  info = "";
  kind = "";
  dup = false;
  userData?: unknown;
  icase = true;
  equal = true;

  constructor(init?: Partial<Candidate>) {
    Object.assign(this, init);
  }
}

export interface Context {
  candidates: Candidate[];
  input: string;
}
