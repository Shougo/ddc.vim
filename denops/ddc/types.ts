import { autocmd } from "./deps.ts";
export { BaseSource } from "./base/source.ts";
export { BaseFilter } from "./base/filter.ts";

export type DdcEvent = autocmd.AutocmdEvent | "Refresh" | "Manual";

export type SourceName = string;

export type Custom = {
  source: Record<SourceName, SourceOptions>;
  option: DdcOptions;
};

export type Context = {
  event: DdcEvent;
  filetype: string;
  input: string;
  lineNr: number;
};

type CompletionMode = "inline" | "popupmenu" | "manual";

export type DdcOptions = {
  autoCompleteEvents: DdcEvent[];
  completionMode: CompletionMode;
  filterOptions: Record<string, Partial<FilterOptions>>;
  filterParams: Record<string, Partial<Record<string, unknown>>>;
  keywordPattern: string;
  sourceOptions: Record<SourceName, Partial<SourceOptions>>;
  sourceParams: Record<SourceName, Partial<Record<string, unknown>>>;
  sources: SourceName[];
};

export type SourceOptions = {
  converters: string[];
  forceCompletionPattern: string;
  ignoreCase: boolean;
  isVolatile: boolean;
  mark: string;
  matchers: string[];
  maxAutoCompleteLength: number;
  maxCandidates: number;
  minAutoCompleteLength: number;
  sorters: string[];
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
