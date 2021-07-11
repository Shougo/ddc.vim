export { BaseSource } from "./base/source.ts";
export { BaseFilter } from "./base/filter.ts";

export type SourceName = string;

export type Custom = {
  source: Record<SourceName, SourceOptions>;
  option: DdcOptions;
};

export interface Context {
  input: string;
}

export interface DdcOptions {
  sources: SourceName[];
  sourceOptions: Record<SourceName, Partial<SourceOptions>>;
  sourceParams: Record<SourceName, Partial<Record<string, unknown>>>;
  filterOptions: Record<string, Partial<FilterOptions>>;
  filterParams: Record<string, Partial<Record<string, unknown>>>;
}

export type SourceOptions = {
  mark: string;
  matchers: string[];
  sorters: string[];
  converters: string[];
};

export interface FilterOptions {
  // TODO: add options and remove placeholder
  placeholder: void;
}

export type Candidate = {
  word: string;
  abbr?: string;
  menu?: string;
  info?: string;
  kind?: string;
  dup?: boolean;
  userData?: unknown;
};

// For internal type
export type DdcCandidate = Candidate & {
  icase: boolean;
  equal: boolean;
  source: SourceName;
};
