import { autocmd } from "./deps.ts";
import { BaseUiParams } from "./base/ui.ts";
import { BaseSourceParams } from "./base/source.ts";
import { BaseFilterParams } from "./base/filter.ts";

export { BaseUi } from "./base/ui.ts";
export { BaseSource } from "./base/source.ts";
export { BaseFilter } from "./base/filter.ts";
export { BaseConfig } from "./base/config.ts";

export type { BaseUiParams } from "./base/ui.ts";
export type { BaseSourceParams } from "./base/source.ts";
export type { BaseFilterParams } from "./base/filter.ts";

export { ContextBuilder } from "./context.ts";

export type DdcExtType = "ui" | "source" | "filter";

export type DdcEvent =
  | autocmd.AutocmdEvent
  | "Initialize"
  | "Manual"
  | "Update";

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
  mode: string;
  nextInput: string;
};

export type DdcOptions = {
  autoCompleteDelay: number;
  autoCompleteEvents: DdcEvent[];
  backspaceCompletion: boolean;
  cmdlineSources: SourceName[] | Record<string, SourceName[]>;
  filterOptions: Record<string, Partial<FilterOptions>>;
  filterParams: Record<string, Partial<BaseFilterParams>>;
  keywordPattern: string;
  postFilters: string[];
  sourceOptions: Record<SourceName, Partial<SourceOptions>>;
  sourceParams: Record<SourceName, Partial<BaseSourceParams>>;
  sources: SourceName[];
  specialBufferCompletion: boolean;
  ui: string;
  uiOptions: Record<SourceName, Partial<UiOptions>>;
  uiParams: Record<SourceName, Partial<BaseUiParams>>;
};

export type UserOptions = Record<string, unknown>;

export type UiOptions = {
  // TODO: add options and remove placeholder
  placeholder: void;
};

export type SourceOptions = {
  converters: string[];
  dup: "keep" | "force" | "ignore";
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
  hl_group: string;
  col: number;
  width: number;
};

export type Column = {
  name: string;
  value: string;
};

export type Item<
  UserData extends unknown = unknown,
> = {
  word: string;
  abbr?: string;
  menu?: string;
  info?: string;
  kind?: string;
  "user_data"?: UserData;
  highlights?: PumHighlight[];
  columns?: Record<string, string>;
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
    __dup: "keep" | "force" | "ignore";
    dup: boolean;
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
