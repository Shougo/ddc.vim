export { BaseSource } from "./base/source.ts";
export { BaseFilter } from "./base/filter.ts";

export type SourceName = string;

export type Custom = {
  source: Record<SourceName, SourceOptions>;
  option: DdcOptions;
};

export type Context = {
  input: string;
};

type CompletionMode = "inline" | "popupmenu" | "manual";

export type DdcOptions = {
  completionMode: CompletionMode;
  sources: SourceName[];
  sourceOptions: Record<SourceName, Partial<SourceOptions>>;
  sourceParams: Record<SourceName, Partial<Record<string, unknown>>>;
  filterOptions: Record<string, Partial<FilterOptions>>;
  filterParams: Record<string, Partial<Record<string, unknown>>>;
};

export type SourceOptions = {
  mark: string;
  maxCandidates: number;
  matchers: string[];
  sorters: string[];
  converters: string[];
};

export type FilterOptions = {
  // TODO: add options and remove placeholder
  placeholder: void;
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

export type SourceResult = {
  completePos: number;
  candidates: ReadableStream<DdcCandidate[]>;
};
