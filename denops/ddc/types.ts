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

export interface DdcOptions {
  sources: string[];
  matchers: string[];
  sorters: string[];
  filters: string[];
}

export const defaultDdcOptions: DdcOptions = {
  sources: ["around"],
  matchers: [],
  sorters: [],
  filters: [],
};

export interface Context {
  candidates: Candidate[];
  input: string;
  options: DdcOptions;
}

export interface SourceOptions {
  matchers: string[];
  sorters: string[];
  converters: string[];
}

export const defaultSourceOptions: SourceOptions = {
  matchers: [],
  sorters: [],
  converters: [],
};
