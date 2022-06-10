import { autocmd } from "./deps.ts";
export { BaseSource } from "./base/source.ts";
export { BaseFilter } from "./base/filter.ts";

export type DdcExtType = "source" | "filter";

export type DdcEvent =
  | autocmd.AutocmdEvent
  | "Initialize"
  | "Manual";

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

type CompletionMenu = "native" | "pum.vim" | "none";
type CompletionMode = "inline" | "popupmenu" | "manual";

export type DdcOptions = {
  autoCompleteDelay: number;
  autoCompleteEvents: DdcEvent[];
  backspaceCompletion: boolean;
  cmdlineSources: SourceName[];
  completionMenu: CompletionMenu;
  completionMode: CompletionMode;
  filterOptions: Record<string, Partial<FilterOptions>>;
  filterParams: Record<string, Partial<Record<string, unknown>>>;
  inlineHighlight: string;
  keywordPattern: string;
  overwriteCompleteopt: boolean;
  postFilters: string[];
  sourceOptions: Record<SourceName, Partial<SourceOptions>>;
  sourceParams: Record<SourceName, Partial<Record<string, unknown>>>;
  sources: SourceName[];
  specialBufferCompletion: boolean;
};

export type SourceOptions = {
  converters: string[];
  dup: boolean;
  enabledIf: string;
  forceCompletionPattern: string;
  ignoreCase: boolean;
  isVolatile: boolean;
  mark: string;
  matcherKey: string;
  matchers: string[];
  maxAutoCompleteLength: number;
  maxItems: number;
  maxKeywordLength: number;
  minAutoCompleteLength: number;
  minKeywordLength: number;
  sorters: string[];
  timeout: number;
};

export type FilterOptions = {
  // TODO: add options and remove placeholder
  placeholder: void;
};

export type PumHighlight = {
  name: string;
  type: "abbr" | "kind" | "menu";
  "hl_group": string;
  col: number;
  width: number;
};

export type Item<
  UserData extends unknown = unknown,
> = {
  word: string;
  abbr?: string;
  menu?: string;
  info?: string;
  kind?: string;
  dup?: boolean;
  "user_data"?: UserData;
  highlights?: PumHighlight[];
};

export type DdcGatherItems<
  UserData extends unknown = unknown,
> = Item<UserData>[] | {
  items: Item<UserData>[];
  isIncomplete: boolean;
};

// For internal type
export type DdcUserData = unknown;

export type DdcItem =
  & Item<DdcUserData>
  & {
    __sourceName: string;
    equal: boolean;
    icase: boolean;
  };

/**
 * NOTE: no guarantees about ordering.
 * @param id
 * @return payload
 */
export type OnCallback = (id: string) => Promise<unknown>;
export interface CallbackContext {
  emit(id: string, payload?: unknown): void;
  revoke(): void;
  createOnCallback(): OnCallback;
}
