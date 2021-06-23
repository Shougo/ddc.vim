export interface Candidate {
  word: string;
  abbr?: string;
  menu?: string;
  info?: string;
  kind?: string;
  dup?: bool;
  userData?: Any;
}

export interface Context {
  candidates: Candidate[];
  input: string;
}
