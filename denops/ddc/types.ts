export { BaseSource } from "./base/source.ts";
export { BaseFilter } from "./base/filter.ts";

export type SourceName = string;

export interface Custom {
  source: Record<SourceName, SourceOptions>;
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
}

// For internal type
export interface DdcCandidate extends Candidate {
  icase: boolean;
  equal: boolean;
  source: SourceName;
}

export interface DdcOptions {
  sources: Record<string, SourceName[]>;
}

export const defaultDdcOptions: DdcOptions = {
  sources: {},
};

export interface Context {
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
