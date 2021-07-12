export { BaseSource } from "./base/source.ts";
export { BaseFilter } from "./base/filter.ts";

export type SourceName = string;

export type Custom = {
  source: Record<SourceName, SourceOptions>;
  option: DdcOptions;
};

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

export type DdcOptions = {
  sources: Record<string, SourceName[]>;
};

export const defaultDdcOptions: DdcOptions = {
  sources: {},
};

export type Context = {
  input: string;
  options: DdcOptions;
};

export type SourceOptions = {
  mark: string;
  matchers: string[];
  sorters: string[];
  converters: string[];
};

export const defaultSourceOptions: SourceOptions = {
  mark: "",
  matchers: [],
  sorters: [],
  converters: [],
};
