import { assertEquals, Denops, ensureString, fn, op, vars } from "./deps.ts";
import {
  Context,
  DdcEvent,
  DdcOptions,
  FilterOptions,
  SourceOptions,
} from "./types.ts";
import { vimoption2ts } from "./util.ts";

// where
// T: Object
// partialMerge: PartialMerge
// partialMerge(partialMerge(a, b), c) == partialMerge(a, partialMerge(b, c))
type PartialMerge<T> = (a: Partial<T>, b: Partial<T>) => Partial<T>;
type Merge<T> = (a: T, b: Partial<T>) => T;
type Default<T> = () => T;

function partialOverwrite<T>(a: Partial<T>, b: Partial<T>): Partial<T> {
  return { ...a, ...b };
}

function overwrite<T>(a: T, b: Partial<T>): T {
  return { ...a, ...b };
}
export const mergeSourceOptions: Merge<SourceOptions> = overwrite;
export const mergeFilterOptions: Merge<FilterOptions> = overwrite;
export const mergeSourceParams: Merge<Record<string, unknown>> = overwrite;
export const mergeFilterParams: Merge<Record<string, unknown>> = overwrite;

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
    completionMenu: "native",
    completionMode: "popupmenu",
    filterOptions: {},
    filterParams: {},
    inlineHighlight: "Comment",
    keywordPattern: "\\k*",
    overwriteCompleteopt: true,
    postFilters: [],
    sourceOptions: {},
    sourceParams: {},
    sources: [],
    specialBufferCompletion: false,
  };
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
  const partialMergeSourceOptions = partialOverwrite;
  const partialMergeSourceParams = partialOverwrite;
  const partialMergeFilterOptions = partialOverwrite;
  const partialMergeFilterParams = partialOverwrite;
  return Object.assign(overwritten, {
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
  context: Record<string, string> = {};
  buffer: Record<number, Partial<DdcOptions>> = {};

  async get(
    denops: Denops | null,
    ft: string,
    bufnr: number,
  ): Promise<DdcOptions> {
    const filetype = this.filetype[ft] || {};
    const context = (this.context[ft] && denops)
      ? await denops.call(
        "denops#callback#call",
        this.context[ft],
      ) as Partial<DdcOptions>
      : {};
    const buffer = this.buffer[bufnr] || {};
    return foldMerge(mergeDdcOptions, defaultDdcOptions, [
      this.global,
      filetype,
      context,
      buffer,
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
  setContext(ft: string, id: string): Custom {
    this.context[ft] = id;
    return this;
  }
  setBuffer(bufnr: number, options: Partial<DdcOptions>): Custom {
    this.buffer[bufnr] = options;
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
  changedTick: number;
  event: DdcEvent;
  filetype: string;
  input: string;
  isLmap: boolean;
  lineNr: number;
  mode: string;
  nextInput: string;
};

function initialWorld(): World {
  return {
    bufnr: 0,
    changedByCompletion: false,
    changedTick: 0,
    event: "Manual",
    filetype: "",
    input: "",
    isLmap: false,
    lineNr: 0,
    mode: "",
    nextInput: "",
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
    return event == "TextChangedP" && Object.keys(completedItem).length != 0;
  })();
  const changedTickPromise = vars.b.get(denops, "changedtick") as Promise<
    number
  >;
  const filetypePromise: Promise<string> = (async () => {
    const context = await _call(denops, "context_filetype#get_filetype", "");
    if (context != "") return context;
    return ensureString(await op.filetype.getLocal(denops));
  })();
  const bufnrPromise: Promise<number> = fn.bufnr(denops);
  const lineNrPromise: Promise<number> = fn.line(denops, ".");
  const enabledEskkPromise = _call(denops, "eskk#is_enabled", false);
  const enabledSkkeletonPromise = _call(denops, "skkeleton#is_enabled", false);
  const iminsertPromise = op.iminsert.getLocal(denops);
  const mode: string = event == "InsertEnter"
    ? "i"
    : ensureString(await fn.mode(denops));
  const inputPromise = denops.call("ddc#util#get_input", event) as Promise<
    string
  >;
  const nextInputPromise = denops.call(
    "ddc#util#get_next_input",
    event,
  ) as Promise<
    string
  >;
  const [
    bufnr,
    changedByCompletion,
    changedTick,
    filetype,
    input,
    enabledEskk,
    enabledSkkeleton,
    iminsert,
    lineNr,
    nextInput,
  ] = await Promise.all([
    bufnrPromise,
    changedByCompletionPromise,
    changedTickPromise,
    filetypePromise,
    inputPromise,
    enabledEskkPromise,
    enabledSkkeletonPromise,
    iminsertPromise,
    lineNrPromise,
    nextInputPromise,
  ]);
  return {
    bufnr,
    changedByCompletion,
    changedTick,
    event,
    filetype,
    input,
    isLmap: !enabledEskk && !enabledSkkeleton && iminsert == 1,
    lineNr,
    mode,
    nextInput,
  };
}

// is neglect-able
function isNegligible(older: World, newer: World): boolean {
  return older.bufnr == newer.bufnr &&
    older.filetype == newer.filetype &&
    older.input == newer.input &&
    older.event == newer.event;
}

export class ContextBuilder {
  private lastWorld: World = initialWorld();
  private custom: Custom = new Custom();

  // Re-export for denops.dispatcher
  async _cacheWorld(denops: Denops, event: DdcEvent): Promise<World> {
    return await cacheWorld(denops, event);
  }

  async createContext(
    denops: Denops,
    event: DdcEvent,
  ): Promise<[boolean, Context, DdcOptions]> {
    const world = await this._cacheWorld(denops, event);
    const old = this.lastWorld;
    this.lastWorld = world;
    let skip = false;
    const skipNegligible = (
      event != "Manual" && event != "Initialize" && event != "CompleteDone" &&
      isNegligible(old, world)
    );
    if (skipNegligible || world.isLmap || world.changedByCompletion) {
      skip = true;
    }

    const context = {
      changedTick: world.changedTick,
      event: event,
      filetype: world.filetype,
      input: world.input,
      lineNr: world.lineNr,
      nextInput: world.nextInput,
    };
    return [
      skip,
      context,
      await this._getUserOptions(denops, world),
    ];
  }

  async _getUserOptions(denops: Denops, world: World): Promise<DdcOptions> {
    const userOptions = await this.custom.get(
      denops,
      world.filetype,
      world.bufnr,
    );

    // Convert keywordPattern
    const iskeyword = await op.iskeyword.getLocal(denops);
    userOptions.keywordPattern = userOptions.keywordPattern.replaceAll(
      /\\k/g,
      () => "[" + vimoption2ts(iskeyword) + "]",
    );

    return userOptions;
  }

  getGlobal(): Partial<DdcOptions> {
    return this.custom.global;
  }
  getFiletype(): Record<string, Partial<DdcOptions>> {
    return this.custom.filetype;
  }
  getContext(): Record<string, string> {
    return this.custom.context;
  }
  getBuffer(): Record<number, Partial<DdcOptions>> {
    return this.custom.buffer;
  }
  async getCurrent(denops: Denops): Promise<DdcOptions> {
    const world = await this._cacheWorld(denops, "Manual");
    return this._getUserOptions(denops, world);
  }

  setGlobal(options: Partial<DdcOptions>) {
    this.custom.setGlobal(options);
  }
  setFiletype(ft: string, options: Partial<DdcOptions>) {
    this.custom.setFiletype(ft, options);
  }
  setContext(ft: string, id: string) {
    this.custom.setContext(ft, id);
  }
  setBuffer(bufnr: number, options: Partial<DdcOptions>) {
    this.custom.setBuffer(bufnr, options);
  }

  patchGlobal(options: Partial<DdcOptions>) {
    this.custom.patchGlobal(options);
  }
  patchFiletype(ft: string, options: Partial<DdcOptions>) {
    this.custom.patchFiletype(ft, options);
  }
  patchBuffer(bufnr: number, options: Partial<DdcOptions>) {
    this.custom.patchBuffer(bufnr, options);
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
  assertEquals(await custom.get(null, "typescript", 1), {
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
  assertEquals(await custom.get(null, "typescript", 2), {
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
  assertEquals(await custom.get(null, "cpp", 1), {
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
