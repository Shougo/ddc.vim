import type {
  BaseParams,
  Callback,
  Context,
  ContextBuilder,
  ContextCallbacks,
  DdcEvent,
  DdcOptions,
  FilterOptions,
  SourceOptions,
  UiOptions,
  UserOptions,
} from "./types.ts";
import { defaultSourceOptions } from "./base/source.ts";
import { callCallback, printError } from "./utils.ts";

import type { Denops } from "@denops/std";
import * as op from "@denops/std/option";
import * as vimOp from "@denops/std/option/vim";
import * as fn from "@denops/std/function";
import * as vars from "@denops/std/variable";
import { collect } from "@denops/std/batch";

import { assertEquals } from "@std/assert/equals";
import { ensure } from "@core/unknownutil/ensure";
import { is } from "@core/unknownutil/is";

// where
// T: Object
// partialMerge: PartialMerge
// partialMerge(partialMerge(a, b), c) === partialMerge(a, partialMerge(b, c))
type PartialMerge<T> = (a: Partial<T>, b: Partial<T>) => Partial<T>;
type Merge<T> = (a: T, b: Partial<T>) => T;
type Default<T> = () => T;

function partialOverwrite<T>(a: Partial<T>, b: Partial<T>): Partial<T> {
  return { ...a, ...b };
}

function overwrite<T>(a: T, b: Partial<T>): T {
  return { ...a, ...b };
}
export const mergeUiOptions: Merge<UiOptions> = overwrite;
export const mergeSourceOptions: Merge<SourceOptions> = overwrite;
export const mergeFilterOptions: Merge<FilterOptions> = overwrite;
export const mergeUiParams: Merge<BaseParams> = overwrite;
export const mergeSourceParams: Merge<BaseParams> = overwrite;
export const mergeFilterParams: Merge<BaseParams> = overwrite;

export function foldMerge<T>(
  merge: Merge<T>,
  def: Default<T>,
  partials: (null | undefined | Partial<T>)[],
): T {
  return partials.map((x) => x || {}).reduce(merge, def());
}

export function defaultDdcOptions(): DdcOptions {
  return {
    autoCompleteDelay: 0,
    autoCompleteEvents: [
      "InsertEnter",
      "TextChangedI",
      "TextChangedP",
    ],
    backspaceCompletion: false,
    cmdlineSources: [],
    dynamicSources: "",
    dynamicUi: "",
    filterOptions: {},
    filterParams: {},
    hideOnEvents: false,
    postFilters: [],
    sourceOptions: {},
    sourceParams: {},
    sources: [],
    specialBufferCompletion: false,
    ui: "",
    uiOptions: {},
    uiParams: {},
  };
}

export function defaultDummy(): Record<string, unknown> {
  return {};
}

function migrateEachKeys<T>(
  merge: PartialMerge<T>,
  a: null | undefined | Record<string, Partial<T>>,
  b: null | undefined | Record<string, Partial<T>>,
): null | Record<string, Partial<T>> {
  if (!a && !b) return null;
  const ret: Record<string, Partial<T>> = {};
  if (a) {
    for (const key in a) {
      ret[key] = a[key];
    }
  }
  if (b) {
    for (const key in b) {
      if (key in ret) {
        ret[key] = merge(ret[key], b[key]);
      } else {
        ret[key] = b[key];
      }
    }
  }
  return ret;
}

export function mergeDdcOptions(
  a: DdcOptions,
  b: Partial<DdcOptions>,
): DdcOptions {
  const overwritten: DdcOptions = overwrite(a, b);
  const partialMergeUiOptions = partialOverwrite;
  const partialMergeUiParams = partialOverwrite;
  const partialMergeSourceOptions = partialOverwrite;
  const partialMergeSourceParams = partialOverwrite;
  const partialMergeFilterOptions = partialOverwrite;
  const partialMergeFilterParams = partialOverwrite;
  return Object.assign(overwritten, {
    uiOptions: migrateEachKeys(
      partialMergeUiOptions,
      a.uiOptions,
      b.uiOptions,
    ) || {},
    sourceOptions: migrateEachKeys(
      partialMergeSourceOptions,
      a.sourceOptions,
      b.sourceOptions,
    ) || {},
    filterOptions: migrateEachKeys(
      partialMergeFilterOptions,
      a.filterOptions,
      b.filterOptions,
    ) || {},
    uiParams: migrateEachKeys(
      partialMergeUiParams,
      a.uiParams,
      b.uiParams,
    ) || {},
    sourceParams: migrateEachKeys(
      partialMergeSourceParams,
      a.sourceParams,
      b.sourceParams,
    ) || {},
    filterParams: migrateEachKeys(
      partialMergeFilterParams,
      a.filterParams,
      b.filterParams,
    ) || {},
  });
}

function patchDdcOptions(
  a: Partial<DdcOptions>,
  b: Partial<DdcOptions>,
): Partial<DdcOptions> {
  const overwritten: Partial<DdcOptions> = { ...a, ...b };

  const uo = migrateEachKeys(
    partialOverwrite,
    a.uiOptions,
    b.uiOptions,
  );
  if (uo) overwritten.uiOptions = uo;
  const so = migrateEachKeys(
    partialOverwrite,
    a.sourceOptions,
    b.sourceOptions,
  );
  if (so) overwritten.sourceOptions = so;
  const fo = migrateEachKeys(
    partialOverwrite,
    a.filterOptions,
    b.filterOptions,
  );
  if (fo) overwritten.filterOptions = fo;

  const up = migrateEachKeys(partialOverwrite, a.uiParams, b.uiParams);
  if (up) overwritten.uiParams = up;
  const sp = migrateEachKeys(partialOverwrite, a.sourceParams, b.sourceParams);
  if (sp) overwritten.sourceParams = sp;
  const fp = migrateEachKeys(partialOverwrite, a.filterParams, b.filterParams);
  if (fp) overwritten.filterParams = fp;

  return overwritten;
}

// Customization by end users
class Custom {
  global: Partial<DdcOptions> = {};
  filetype: Record<string, Partial<DdcOptions>> = {};
  context: ContextCallbacks = {
    global: "",
    filetype: {},
    buffer: {},
  };
  buffer: Record<number, Partial<DdcOptions>> = {};

  async get(
    denops: Denops | null,
    ft: string,
    bufnr: number,
    options: UserOptions,
  ): Promise<DdcOptions> {
    const contextGlobal = await callCallback(
      denops,
      this.context.global,
      {},
    ) as Partial<DdcOptions | null>;
    const filetype = this.filetype[ft] || {};
    const contextFiletype = await callCallback(
      denops,
      this.context.filetype[ft],
      {},
    ) as Partial<DdcOptions | null>;
    const buffer = this.buffer[bufnr] || {};
    const contextBuffer = await callCallback(
      denops,
      this.context.buffer[bufnr],
      {},
    ) as Partial<DdcOptions | null>;

    return foldMerge(mergeDdcOptions, defaultDdcOptions, [
      this.global,
      contextGlobal,
      filetype,
      contextFiletype,
      buffer,
      contextBuffer,
      options,
    ]);
  }

  setGlobal(options: Partial<DdcOptions>): Custom {
    this.global = options;
    return this;
  }
  setFiletype(ft: string, options: Partial<DdcOptions>): Custom {
    this.filetype[ft] = options;
    return this;
  }
  setBuffer(bufnr: number, options: Partial<DdcOptions>): Custom {
    this.buffer[bufnr] = options;
    return this;
  }
  setContextGlobal(callback: Callback): Custom {
    this.context.global = callback;
    return this;
  }
  setContextFiletype(callback: Callback, ft: string): Custom {
    this.context.filetype[ft] = callback;
    return this;
  }
  setContextBuffer(callback: Callback, bufnr: number): Custom {
    this.context.buffer[bufnr] = callback;
    return this;
  }
  patchGlobal(options: Partial<DdcOptions>): Custom {
    this.global = patchDdcOptions(this.global, options);
    return this;
  }
  patchFiletype(ft: string, options: Partial<DdcOptions>): Custom {
    this.filetype[ft] = patchDdcOptions(this.filetype[ft] || {}, options);
    return this;
  }
  patchBuffer(bufnr: number, options: Partial<DdcOptions>): Custom {
    this.buffer[bufnr] = patchDdcOptions(this.buffer[bufnr] || {}, options);
    return this;
  }
}

// Schema of the state of buffers, etc
type World = {
  bufnr: number;
  changedByCompletion: boolean;
  cursor: (number | undefined)[];
  event: DdcEvent;
  filetype: string;
  input: string;
  isLmap: boolean;
  isPaste: boolean;
  lineNr: number;
  mode: string;
  nextInput: string;
  wildMenuMode: number;
};

function initialWorld(): World {
  return {
    bufnr: 0,
    changedByCompletion: false,
    cursor: [],
    event: "Manual",
    filetype: "",
    input: "",
    isLmap: false,
    isPaste: false,
    lineNr: 0,
    mode: "",
    nextInput: "",
    wildMenuMode: 0,
  };
}

async function _call<T>(denops: Denops, f: string, def: T): Promise<T> {
  if (await fn.exists(denops, "*" + f)) {
    return denops.call(f) as Promise<T>;
  } else {
    return def;
  }
}

// Fetches current state
async function cacheWorld(denops: Denops, event: DdcEvent): Promise<World> {
  const changedByCompletionPromise: Promise<boolean> = (async () => {
    const completedItem =
      (await vars.v.get(denops, "completed_item")) as Record<string, unknown>;
    return event === "TextChangedP" && Object.keys(completedItem).length !== 0;
  })();

  type ContextFiletype = "context_filetype" | "treesitter" | "none";

  const filetypePromise: Promise<string> = (async () => {
    const contextFiletype =
      await (vars.g.get(denops, "ddc#_context_filetype", "none") as Promise<
        ContextFiletype
      >);

    if (contextFiletype === "context_filetype") {
      const context = await _call(denops, "context_filetype#get_filetype", "");
      if (context !== "") return context;
    } else if (contextFiletype === "treesitter") {
      const context = await denops.call("ddc#syntax#lang") as string;
      if (context !== "") return context;
    }

    return ensure(await op.filetype.getLocal(denops), is.String);
  })();

  const [
    bufnr,
    cursor,
    iminsert,
    isPaste,
    lineNr,
    wildMenuMode,
  ] = await collect(denops, (denops) => [
    fn.bufnr(denops),
    fn.getcurpos(denops),
    op.iminsert.getLocal(denops),
    // NOTE: op.paste is deprecated in neovim
    vimOp.paste.get(denops),
    fn.line(denops, "."),
    fn.wildmenumode(denops) as Promise<number>,
  ]);

  // NOTE: don't use collect() for them.
  // Other plugins may change the state.
  const mode: string = event === "InsertEnter"
    ? "i"
    : ensure(await fn.mode(denops), is.String);
  const filetype = await filetypePromise;
  const changedByCompletion = await changedByCompletionPromise;
  const input = await denops.call("ddc#util#get_input", event) as string;
  const nextInput = await denops.call(
    "ddc#util#get_next_input",
    event,
  ) as string;

  return {
    bufnr,
    changedByCompletion,
    cursor,
    event,
    filetype,
    input,
    isLmap: iminsert === 1,
    isPaste,
    lineNr,
    mode,
    nextInput,
    wildMenuMode,
  };
}

// is neglect-able
function isNegligible(older: World, newer: World): boolean {
  return older.bufnr === newer.bufnr &&
    older.filetype === newer.filetype &&
    older.input === newer.input &&
    older.event === newer.event;
}

export class ContextBuilderImpl implements ContextBuilder {
  #lastWorld: World = initialWorld();
  #custom: Custom = new Custom();

  async createContext(
    denops: Denops,
    event: DdcEvent,
    options: UserOptions = {},
  ): Promise<[boolean, Context, DdcOptions]> {
    const world = await cacheWorld(denops, event);
    const old = this.#lastWorld;
    this.#lastWorld = world;
    let skip = false;
    const skipNegligible = event !== "Initialize" && event !== "Manual" &&
      event !== "Update" && event !== "CompleteDone" &&
      isNegligible(old, world);
    if (
      skipNegligible || world.isLmap || world.isPaste ||
      world.changedByCompletion ||
      (world.mode === "c" && world.wildMenuMode)
    ) {
      skip = true;
    }

    const context = {
      cursor: world.cursor,
      event: event,
      filetype: world.filetype,
      input: world.input,
      lineNr: world.lineNr,
      mode: world.mode,
      nextInput: world.nextInput,
    };

    const userOptions = await this.#getUserOptions(denops, world, options);

    await this.#validate(denops, "options", userOptions, defaultDdcOptions());
    for (const key in userOptions.sourceOptions) {
      await this.#validate(
        denops,
        "sourceOptions",
        userOptions.sourceOptions[key],
        defaultSourceOptions(),
      );
    }

    if (context.mode === "c") {
      // Use cmdlineSources instead
      if (Array.isArray(userOptions.cmdlineSources)) {
        userOptions.sources = userOptions.cmdlineSources;
      } else if (is.Record(userOptions.cmdlineSources)) {
        const cmdType = await fn.getcmdtype(denops) as string;
        if (userOptions.cmdlineSources[cmdType]) {
          userOptions.sources = userOptions.cmdlineSources[cmdType];
        }
      }
    }

    const dynamicSources = await callCallback(
      denops,
      userOptions.dynamicSources,
      {
        context,
        sources: userOptions.sources,
      },
    ) as string[] | null;
    if (dynamicSources) {
      userOptions.sources = dynamicSources;
    }

    return [
      skip,
      context,
      userOptions,
    ];
  }

  async #getUserOptions(
    denops: Denops,
    world: World,
    options: UserOptions = {},
  ): Promise<DdcOptions> {
    return await this.#custom.get(
      denops,
      world.filetype,
      world.bufnr,
      options,
    );
  }

  getGlobal(): Partial<DdcOptions> {
    return this.#custom.global;
  }
  getFiletype(): Record<string, Partial<DdcOptions>> {
    return this.#custom.filetype;
  }
  getContext(): ContextCallbacks {
    return this.#custom.context;
  }
  getBuffer(): Record<number, Partial<DdcOptions>> {
    return this.#custom.buffer;
  }
  async getCurrent(denops: Denops): Promise<DdcOptions> {
    const world = await cacheWorld(denops, "Manual");
    return this.#getUserOptions(denops, world);
  }

  async #validate(
    denops: Denops,
    name: string,
    options: Record<string, unknown>,
    defaults: Record<string, unknown>,
  ) {
    for (const key in options) {
      if (!(key in defaults)) {
        await printError(
          denops,
          `Invalid ${name}: "${key}"`,
        );
      }
    }
  }

  setGlobal(options: Partial<DdcOptions>) {
    this.#custom.setGlobal(options);
  }
  setFiletype(ft: string, options: Partial<DdcOptions>) {
    this.#custom.setFiletype(ft, options);
  }
  setBuffer(bufnr: number, options: Partial<DdcOptions>) {
    this.#custom.setBuffer(bufnr, options);
  }
  setContextGlobal(callback: Callback) {
    this.#custom.setContextGlobal(callback);
  }
  setContextFiletype(callback: Callback, ft: string) {
    this.#custom.setContextFiletype(callback, ft);
  }
  setContextBuffer(callback: Callback, bufnr: number) {
    this.#custom.setContextBuffer(callback, bufnr);
  }

  patchGlobal(options: Partial<DdcOptions>) {
    this.#custom.patchGlobal(options);
  }
  patchFiletype(ft: string, options: Partial<DdcOptions>) {
    this.#custom.patchFiletype(ft, options);
  }
  patchBuffer(bufnr: number, options: Partial<DdcOptions>) {
    this.#custom.patchBuffer(bufnr, options);
  }
}

Deno.test("isNegligible", () => {
  assertEquals(true, isNegligible(initialWorld(), initialWorld()));
  assertEquals(
    isNegligible(
      { ...initialWorld(), input: "a" },
      { ...initialWorld(), input: "ab" },
    ),
    false,
  );
});

Deno.test("patchDdcOptions", () => {
  const custom = (new Custom())
    .setGlobal({
      sources: ["around"],
      sourceParams: {
        "around": {
          maxSize: 300,
        },
      },
    })
    .patchGlobal({
      sources: ["around", "baz"],
      sourceParams: {
        "baz": {
          foo: "bar",
        },
      },
    })
    .patchFiletype("markdown", {
      filterParams: {
        "hoge": {
          foo: "bar",
        },
      },
    })
    .patchFiletype("cpp", {
      filterParams: {
        "hoge": {
          foo: "bar",
        },
      },
    })
    .patchFiletype("cpp", {
      filterParams: {
        "hoge": {
          foo: "baz",
          alice: "bob",
        },
      },
    });
  assertEquals(custom.global, {
    sources: ["around", "baz"],
    sourceParams: {
      "around": {
        maxSize: 300,
      },
      "baz": {
        foo: "bar",
      },
    },
  });
  assertEquals(custom.filetype, {
    markdown: {
      filterParams: {
        "hoge": {
          foo: "bar",
        },
      },
    },
    cpp: {
      filterParams: {
        "hoge": {
          foo: "baz",
          alice: "bob",
        },
      },
    },
  });
});

Deno.test("mergeDdcOptions", async () => {
  const custom = (new Custom())
    .setGlobal({
      sources: ["around"],
      sourceParams: {
        "around": {
          maxSize: 300,
        },
      },
    })
    .setFiletype("typescript", {
      sources: [],
      filterParams: {
        "matcher_head": {
          foo: 2,
        },
      },
    })
    .setBuffer(1, {
      sources: ["around", "foo"],
      filterParams: {
        "matcher_head": {
          foo: 3,
        },
        "foo": {
          max: 200,
        },
      },
    })
    .patchBuffer(2, {});
  assertEquals(await custom.get(null, "typescript", 1, {}), {
    ...defaultDdcOptions(),
    sources: ["around", "foo"],
    sourceOptions: {},
    filterOptions: {},
    sourceParams: {
      "around": {
        maxSize: 300,
      },
    },
    filterParams: {
      "matcher_head": {
        foo: 3,
      },
      "foo": {
        max: 200,
      },
    },
  });
  assertEquals(await custom.get(null, "typescript", 2, {}), {
    ...defaultDdcOptions(),
    sources: [],
    sourceOptions: {},
    filterOptions: {},
    sourceParams: {
      "around": {
        maxSize: 300,
      },
    },
    filterParams: {
      "matcher_head": {
        foo: 2,
      },
    },
  });
  assertEquals(await custom.get(null, "cpp", 1, {}), {
    ...defaultDdcOptions(),
    sources: ["around", "foo"],
    sourceOptions: {},
    filterOptions: {},
    sourceParams: {
      "around": {
        maxSize: 300,
      },
    },
    filterParams: {
      "matcher_head": {
        foo: 3,
      },
      "foo": {
        max: 200,
      },
    },
  });
});
