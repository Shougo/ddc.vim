import type { Denops } from "@denops/std";
import type { AutocmdEvent } from "@denops/std/autocmd";

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
  cursor: (number | undefined)[];
  event: DdcEvent;
  filetype: string;
  input: string;
  lineNr: number;
  mode: string;
  nextInput: string;
};

export type Callback =
  | string
  | ((denops: Denops, args: Record<string, unknown>) => Promise<unknown>);

export type ContextCallbacks = {
  global: Callback;
  filetype: Record<string, Callback>;
  buffer: Record<number, Callback>;
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
  setContextGlobal(callback: Callback): void;
  setContextFiletype(callback: Callback, ft: string): void;
  setContextBuffer(callback: Callback, bufnr: number): void;
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
  dynamicSources: Callback;
  dynamicUi: Callback;
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
  cacheTimeout: number;
  converters: UserFilter[];
  dup: "keep" | "force" | "ignore";
  enabledIf: string;
  forceCompletionPattern: string;
  hideTimeout: number;
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

type PreviewerCommon = {
  /**
   * Line number of preview buffer to be made center and highlighted
   */
  lineNr?: number;
};

type EmptyPreviewer = {
  kind: "empty";
} & PreviewerCommon;

export type CommandPreviewer = {
  kind: "command";

  command: string;
} & PreviewerCommon;

export type HelpPreviewer = {
  kind: "help";

  tag: string;
} & PreviewerCommon;

type MarkdownPreviewer = {
  kind: "markdown";

  contents: string[];
} & PreviewerCommon;

type TextPreviewer = {
  kind: "text";

  contents: string[];
} & PreviewerCommon;

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
