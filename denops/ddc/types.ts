export { BaseSource } from "./base/source.ts";
export { BaseFilter } from "./base/filter.ts";

export interface Custom {
  source: Record<string, SourceOptions>;
  option: DdcOptions;
}

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
  sources: Record<string, string[]>;
}

export const defaultDdcOptions: DdcOptions = {
  sources: {},
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
