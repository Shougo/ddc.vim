export interface Candidate {
  word: string;
  abbr?: string;
  menu?: string;
  info?: string;
  kind?: string;
  dup?: boolean;
  userData?: unknown;
  icase?: boolean;
  equal?: boolean;
}

export interface Context {
  candidates: Candidate[];
  input: string;
}