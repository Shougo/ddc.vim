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
  source?: string;
}

export interface Context {
  candidates: Candidate[];
  input: string;
}
