import type { Denops } from "jsr:@denops/std@~7.1.0";
import type { AutocmdEvent } from "jsr:@denops/std@~7.1.0/autocmd";

export type BaseParams = Record<string, unknown>;

export type DdcExtType = "ui" | "source" | "filter";

export type DdcEvent =
  | AutocmdEvent
  | "Initialize"
  | "Manual"
  | "Update";

export type UiName = string;
export type SourceName = string;
export type FilterName = string;

export type Context = {
  changedTick: number;
  cursor: (number | undefined)[];
  event: DdcEvent;
  filetype: string;
  input: string;
  lineNr: number;
  mode: string;
  nextInput: string;
};

export type ContextCallback =
  | string
  | ((denops: Denops) => Promise<Partial<DdcOptions>>);

export type ContextCallbacks = {
  global: ContextCallback;
  filetype: Record<string, ContextCallback>;
  buffer: Record<number, ContextCallback>;
};

export interface ContextBuilder {
  getGlobal(): Partial<DdcOptions>;
  getFiletype(): Record<string, Partial<DdcOptions>>;
  getContext(): ContextCallbacks;
  getBuffer(): Record<number, Partial<DdcOptions>>;
  getCurrent(denops: Denops): Promise<Partial<DdcOptions>>;
  setGlobal(options: Partial<DdcOptions>): void;
  setFiletype(ft: string, options: Partial<DdcOptions>): void;
  setBuffer(bufnr: number, options: Partial<DdcOptions>): void;
  setContextGlobal(callback: ContextCallback): void;
  setContextFiletype(callback: ContextCallback, ft: string): void;
  setContextBuffer(callback: ContextCallback, bufnr: number): void;
  patchGlobal(options: Partial<DdcOptions>): void;
  patchFiletype(ft: string, options: Partial<DdcOptions>): void;
  patchBuffer(bufnr: number, options: Partial<DdcOptions>): void;
}

export type UserSource = SourceName | {
  name: SourceName;
  options?: Partial<SourceOptions>;
  params?: Partial<BaseParams>;
};

export type UserFilter = FilterName | {
  name: FilterName;
  options?: Partial<FilterOptions>;
  params?: Partial<BaseParams>;
};

export type DdcOptions = {
  autoCompleteDelay: number;
  autoCompleteEvents: DdcEvent[];
  backspaceCompletion: boolean;
  cmdlineSources: UserSource[] | Record<string, UserSource[]>;
  filterOptions: Record<FilterName, Partial<FilterOptions>>;
  filterParams: Record<FilterName, Partial<BaseParams>>;
  hideOnEvents: boolean;
  postFilters: UserFilter[];
  sourceOptions: Record<SourceName, Partial<SourceOptions>>;
  sourceParams: Record<SourceName, Partial<BaseParams>>;
  sources: UserSource[];
  specialBufferCompletion: boolean;
  ui: UiName;
  uiOptions: Record<UiName, Partial<UiOptions>>;
  uiParams: Record<UiName, Partial<BaseParams>>;
};

export type UserOptions = Record<string, unknown>;

export type UiOptions = {
  // TODO: add options and remove placeholder
  placeholder: void;
};

export type SourceOptions = {
  converters: UserFilter[];
  dup: "keep" | "force" | "ignore";
  enabledIf: string;
  forceCompletionPattern: string;
  ignoreCase: boolean;
  isVolatile: boolean;
  keywordPattern: string;
  mark: string;
  matcherKey: string;
  matchers: UserFilter[];
  maxAutoCompleteLength: number;
  maxManualCompleteLength: number;
  maxItems: number;
  maxKeywordLength: number;
  minAutoCompleteLength: number;
  minManualCompleteLength: number;
  minKeywordLength: number;
  preview: boolean;
  sorters: UserFilter[];
  timeout: number;
  replaceSourceInputPattern: string;
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

/**
 * Information of preview window
 */
export type PreviewContext = {
  row?: number;
  col?: number;
  width?: number;
  height?: number;
  isFloating?: boolean;
  split?: "horizontal" | "vertical" | "no";
};

type EmptyPreviewer = {
  kind: "empty";
};

export type CommandPreviewer = {
  kind: "command";

  command: string;
};

export type HelpPreviewer = {
  kind: "help";

  tag: string;
};

type MarkdownPreviewer = {
  kind: "markdown";

  contents: string[];
};

type TextPreviewer = {
  kind: "text";

  contents: string[];
};

/**
 *  Previewer defines how the preview is rendered
 *  This must be implemented in the ddc-source
 */
export type Previewer =
  | CommandPreviewer
  | EmptyPreviewer
  | HelpPreviewer
  | MarkdownPreviewer
  | TextPreviewer;
