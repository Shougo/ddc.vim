import { autocmd } from "./deps.ts";
export { BaseSource } from "./base/source.ts";
export { BaseFilter } from "./base/filter.ts";

export type DdcEvent =
  | autocmd.AutocmdEvent
  | "Manual"
  | "AutoRefresh"
  | "ManualRefresh";

export type SourceName = string;

export type Custom = {
  source: Record<SourceName, SourceOptions>;
  option: DdcOptions;
};

export type Context = {
  changedTick: number;
  event: DdcEvent;
  filetype: string;
  input: string;
  lineNr: number;
  nextInput: string;
};

type CompletionMode = "inline" | "popupmenu" | "manual";

export type DdcOptions = {
  autoCompleteDelay: number;
  autoCompleteEvents: DdcEvent[];
  completionMode: CompletionMode;
  filterOptions: Record<string, Partial<FilterOptions>>;
  filterParams: Record<string, Partial<Record<string, unknown>>>;
  inlineHighlight: string;
  keywordPattern: string;
  overwriteCompleteopt: boolean;
  sourceOptions: Record<SourceName, Partial<SourceOptions>>;
  sourceParams: Record<SourceName, Partial<Record<string, unknown>>>;
  sources: SourceName[];
  specialBufferCompletion: boolean;
};

export type SourceOptions = {
  converters: string[];
  dup: boolean;
  forceCompletionPattern: string;
  ignoreCase: boolean;
  isVolatile: boolean;
  mark: string;
  matcherKey: string;
  matchers: string[];
  maxAutoCompleteLength: number;
  maxCandidates: number;
  minAutoCompleteLength: number;
  sorters: string[];
  timeout: number;
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
  "user_data"?: DdcUserData;
};

// For internal type
export type DdcCandidate = Candidate & {
  icase: boolean;
  equal: boolean;
};

export type DdcUserData = {
  __sourceName?: string;
};
