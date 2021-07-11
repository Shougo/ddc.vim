import { Denops, vars } from "./deps.ts";
import { Context, DdcOptions } from "./types.ts";
import { reduce } from "https://deno.land/x/itertools@v0.1.2/mod.ts";

// where
// T: Object
// partialMerge: PartialMerge
// merge: Merge
// partialMerge(partialMerge(a, b), c) == partialMerge(a, partialMerge(b, c))
type PartialMerge<T> = (a: Partial<T>, b: Partial<T>) => Partial<T>;
type Merge<T> = (a: T, b: Partial<T>) => T;
type Default<T> = () => T;

export function partialOverwrite<T>(a: Partial<T>, b: Partial<T>): Partial<T> {
  return { ...a, ...b };
}

export function overwrite<T>(a: T, b: Partial<T>): T {
  return { ...a, ...b };
}

export const partialMergeSourceOptions = partialOverwrite;
export const partialMergeSourceParams = partialOverwrite;
export const partialMergeFilterOptions = partialOverwrite;
export const partialMergeFilterParams = partialOverwrite;
export const mergeSourceOptions = overwrite;
export const mergeSourceParams = overwrite;
export const mergeFilterOptions = overwrite;
export const mergeFilterParams = overwrite;

export function foldMerge<T>(
  merge: Merge<T>,
  def: Default<T>,
  partials: (null | undefined | Partial<T>)[],
): T {
  return reduce(
    partials.map((x) => x || {}),
    merge,
    def(),
  );
}

export function defaultDdcOptions(): DdcOptions {
  return {
    sources: [],
    defaultMatchers: [],
    defaultSorters: [],
    defaultConverters: [],
    sourceOptions: {},
    sourceParams: {},
    filterOptions: {},
    filterParams: {},
  };
}

function mergeEachKeys<T>(
  merge: PartialMerge<T>,
  a: Record<string, Partial<T>>,
  b: Record<string, Partial<T>>,
): Record<string, Partial<T>> {
  const ret: Record<string, Partial<T>> = {};
  for (const key in a) {
    ret[key] = a[key];
  }
  for (const key in b) {
    if (key in ret) {
      ret[key] = merge(ret[key], b[key]);
    } else {
      ret[key] = b[key];
    }
  }
  return ret;
}

function partialMergeDdcOptions(
  a: Partial<DdcOptions>,
  b: Partial<DdcOptions>,
): Partial<DdcOptions> {
  const overwritten: Partial<DdcOptions> = { ...a, ...b };
  const ret: Partial<DdcOptions> = {};
  if ("sources" in overwritten) ret.sources = overwritten.sources;
  if ("defaultMatchers" in overwritten) {
    ret.defaultMatchers = overwritten.defaultMatchers;
  }
  if ("defaultSorters" in overwritten) {
    ret.defaultSorters = overwritten.defaultSorters;
  }
  if ("defaultConverters" in overwritten) {
    ret.defaultConverters = overwritten.defaultConverters;
  }
  ret.sourceOptions = mergeEachKeys(
    mergeSourceOptions,
    a.sourceOptions || {},
    b.sourceOptions || {},
  );
  ret.filterOptions = mergeEachKeys(
    mergeFilterOptions,
    a.filterOptions || {},
    b.filterOptions || {},
  );
  ret.sourceParams = mergeEachKeys(
    mergeSourceParams,
    a.sourceParams || {},
    b.sourceParams || {},
  );
  ret.filterParams = mergeEachKeys(
    mergeFilterParams,
    a.filterParams || {},
    b.filterParams || {},
  );
  return ret;
}

export function mergeDdcOptions(
  a: DdcOptions,
  b: Partial<DdcOptions>,
): DdcOptions {
  const overwritten: DdcOptions = { ...a, ...b };
  return {
    sources: overwritten.sources,
    defaultMatchers: overwritten.defaultMatchers,
    defaultSorters: overwritten.defaultSorters,
    defaultConverters: overwritten.defaultConverters,
    sourceOptions: mergeEachKeys(
      mergeSourceOptions,
      a.sourceOptions,
      b.sourceOptions || {},
    ),
    filterOptions: mergeEachKeys(
      mergeFilterOptions,
      a.filterOptions,
      b.filterOptions || {},
    ),
    sourceParams: mergeEachKeys(
      mergeSourceParams,
      a.sourceParams,
      b.sourceParams || {},
    ),
    filterParams: mergeEachKeys(
      mergeFilterParams,
      a.filterParams,
      b.filterParams || {},
    ),
  };
}

// Customization by end users
class Custom {
  global: Partial<DdcOptions> = {};
  filetype: Record<string, Partial<DdcOptions>> = {};
  buffer: Record<number, Partial<DdcOptions>> = {};

  get(ft: string, bufnr: number): Partial<DdcOptions> {
    const filetype = this.filetype[ft] || {};
    const buffer = this.buffer[bufnr] || {};
    let ret = this.global;
    ret = partialMergeDdcOptions(ret, filetype);
    ret = partialMergeDdcOptions(ret, buffer);
    return ret;
  }

  setGlobal(options: Partial<DdcOptions>) {
    this.global = options;
  }
  setFiletype(ft: string, options: Partial<DdcOptions>) {
    this.filetype[ft] = options;
  }
  setBuffer(bufnr: number, options: Partial<DdcOptions>) {
    this.buffer[bufnr] = options;
  }
  patchGlobal(options: Partial<DdcOptions>) {
    Object.assign(this.global, options);
  }
  patchFiletype(ft: string, options: Partial<DdcOptions>) {
    Object.assign(this.filetype[ft] || {}, options);
  }
  patchBuffer(bufnr: number, options: Partial<DdcOptions>) {
    Object.assign(this.buffer[bufnr] || {}, options);
  }
}

// Caches the state of buffers, etc. immediately after an event occurs.
interface World {
  bufnr: number;
  filetype: string;
  event: string;
  mode: string;
  input: string;
  changedByCompletion: boolean;
  isLmap: boolean;
}

// Fetchs current state
async function cacheWorld(denops: Denops, event: string): Promise<World> {
  const changedByCompletion: Promise<boolean> = (async () => {
    const completedItem =
      (await vars.v.get(denops, "completed_item")) as Record<string, unknown>;
    return event == "TextChangedP" && Object.keys(completedItem).length != 0;
  })();
  const isLmap: Promise<boolean> = (async () => {
    const iminsert =
      (await denops.call("getbufvar", "%", "&iminsert")) as number;
    return iminsert == 1;
  })();
  const mode: string = event == "InsertEnter"
    ? "i"
    : (await denops.call("mode")) as string;
  const input: Promise<string> = (async () => {
    return (await denops.call("ddc#get_input", mode)) as string;
  })();
  const bufnr: Promise<number> = (async () => {
    return (await denops.call("bufnr")) as number;
  })();
  const filetype: Promise<string> = (async () => {
    return (await denops.call("getbufvar", "%", "&filetype")) as string;
  })();
  return {
    bufnr: await bufnr,
    filetype: await filetype,
    event: event,
    mode: mode,
    input: await input,
    changedByCompletion: await changedByCompletion,
    isLmap: await isLmap,
  };
}

export class ContextBuilder {
  lastWorld: World;
  custom: Custom = new Custom();

  constructor() {
    this.lastWorld = {
      bufnr: 0,
      filetype: "",
      event: "",
      mode: "",
      input: "",
      changedByCompletion: false,
      isLmap: false,
    };
  }

  async createContext(
    denops: Denops,
    event: string,
  ): Promise<null | [Context, Partial<DdcOptions>]> {
    const world = await cacheWorld(denops, event);
    if (this.lastWorld == world) return null;
    this.lastWorld = world;
    if (world.isLmap || world.changedByCompletion) {
      return null;
    }
    const userOptions = this.custom.get(world.filetype, world.bufnr);
    const context = {
      input: world.input,
    };
    return [context, userOptions];
  }

  getGlobal(): Partial<DdcOptions> {
    return this.custom.global;
  }
  getFiletype(): Record<string, Partial<DdcOptions>> {
    return this.custom.filetype;
  }
  getBuffer(): Record<number, Partial<DdcOptions>> {
    return this.custom.buffer;
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
