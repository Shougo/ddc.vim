import type {
  BaseParams,
  DdcExtType,
  FilterName,
  SourceName,
  UiName,
} from "./types.ts";
import type { BaseSource } from "./base/source.ts";
import type { BaseFilter } from "./base/filter.ts";
import type { BaseUi } from "./base/ui.ts";
import { importPlugin, isDenoCacheIssueError } from "./utils.ts";

import type { Denops } from "@denops/std";
import * as op from "@denops/std/option";
import * as fn from "@denops/std/function";

import { basename } from "@std/path/basename";
import { dirname } from "@std/path/dirname";
import { join } from "@std/path/join";
import { parse } from "@std/path/parse";
import { Lock } from "@core/asyncutil/lock";

type Ext = {
  ui: Record<string, BaseUi<BaseParams>>;
  source: Record<string, BaseSource<BaseParams>>;
  filter: Record<string, BaseFilter<BaseParams>>;
};

const PLUGIN_PREFIX = "@ddc";

// Pattern for directories where auto-loadable extensions are placed by type
const TYPE_DIR_PATTERN = `denops/${PLUGIN_PREFIX}-*s`;

// Structured extension module entry point file.
const EXT_ENTRY_POINT_FILE = "main.ts";

export class Loader {
  #exts: Ext = {
    ui: {},
    source: {},
    filter: {},
  };
  #aliases: Record<DdcExtType, Record<string, string>> = {
    ui: {},
    source: {},
    filter: {},
  };
  #checkPaths: Record<string, boolean> = {};
  #registerLock = new Lock(0);
  #cachedPaths = new Map<string, string>();
  #prevRuntimepath = "";

  async autoload(
    denops: Denops,
    type: DdcExtType,
    name: string,
  ): Promise<boolean> {
    const runtimepath = await op.runtimepath.getGlobal(denops);
    if (runtimepath !== this.#prevRuntimepath) {
      const cachedPaths = await createPathCache(denops, runtimepath);

      // NOTE: glob may be invalid.
      if (cachedPaths.size > 0) {
        this.#cachedPaths = cachedPaths;
        this.#prevRuntimepath = runtimepath;
      }
    }

    const key = `${PLUGIN_PREFIX}-${type}s/${
      this.getAlias(type, name) ?? name
    }`;
    const path = this.#cachedPaths.get(key);

    if (!path) {
      return this.#prevRuntimepath === "";
    }

    await this.registerPath(type, path);
    return true;
  }

  registerAlias(type: DdcExtType, alias: string, base: string) {
    this.#aliases[type][alias] = base;
  }

  async registerPath(type: DdcExtType, path: string): Promise<void> {
    // Fast-path: skip I/O if already registered.
    if (path in this.#checkPaths) {
      return;
    }

    const name = parse(path).name;

    // Perform I/O outside the lock so concurrent calls run in parallel.
    // NOTE: We intentionally use Deno.stat instead of safeStat here. We expect
    // errors to be thrown when paths don't exist or are inaccessible.
    // deno-lint-ignore no-explicit-any
    let importedMod: any;
    try {
      const fileInfo = await Deno.stat(path);
      const entryPoint = fileInfo.isDirectory
        ? join(path, EXT_ENTRY_POINT_FILE)
        : path;
      importedMod = await importPlugin(entryPoint);
    } catch (e) {
      if (isDenoCacheIssueError(e)) {
        console.warn("*".repeat(80));
        console.warn(`Deno module cache issue is detected.`);
        console.warn(
          `Execute '!deno cache --reload "${path}"' and restart Vim/Neovim.`,
        );
        console.warn("*".repeat(80));
      }

      console.error(`Failed to load file '${path}': ${e}`);
      throw e;
    }

    // Update shared state under lock; re-check to avoid duplicate registration
    // by concurrent calls that passed the fast-path check simultaneously.
    await this.#registerLock.lock(() => {
      if (path in this.#checkPaths) {
        return;
      }

      const typeExt = this.#exts[type];
      let add: (name: string) => void;
      switch (type) {
        case "ui":
          add = (name: string) => {
            const ext = new importedMod.Ui();
            ext.name = name;
            ext.path = path;
            typeExt[name] = ext;
          };
          break;
        case "source":
          add = (name: string) => {
            const ext = new importedMod.Source();
            ext.name = name;
            ext.path = path;
            typeExt[name] = ext;
          };
          break;
        case "filter":
          add = (name: string) => {
            const ext = new importedMod.Filter();
            ext.name = name;
            ext.path = path;
            typeExt[name] = ext;
          };
          break;
        default:
          throw new Error(`Unknown extension type: ${type}`);
      }

      add(name);

      // Check alias
      const aliases = this.getAliasNames(type).filter(
        (k) => this.getAlias(type, k) === name,
      );
      for (const alias of aliases) {
        add(alias);
      }

      this.#checkPaths[path] = true;
    });
  }

  async registerPaths(type: DdcExtType, paths: string[]): Promise<void> {
    const results = await Promise.allSettled(
      paths.map((path) => this.registerPath(type, path)),
    );
    for (const result of results) {
      if (result.status === "rejected") {
        console.error(
          `registerPaths: failed to register a path: ${result.reason}`,
        );
      }
    }
  }

  registerExtension(type: "ui", name: string, ext: BaseUi<BaseParams>): void;
  registerExtension(
    type: "source",
    name: string,
    ext: BaseSource<BaseParams>,
  ): void;
  registerExtension(
    type: "filter",
    name: string,
    ext: BaseFilter<BaseParams>,
  ): void;
  registerExtension(
    type: DdcExtType,
    name: string,
    ext:
      | BaseUi<BaseParams>
      | BaseSource<BaseParams>
      | BaseFilter<BaseParams>,
  ) {
    ext.name = name;
    this.#exts[type][name] = ext;
  }

  getAliasNames(type: DdcExtType): string[] {
    return Object.keys(this.#aliases[type]);
  }
  getAlias(type: DdcExtType, name: string): string {
    return this.#aliases[type][name];
  }
  async getUi(
    denops: Denops,
    name: UiName,
  ): Promise<BaseUi<BaseParams> | null> {
    if (!this.#exts.ui[name]) {
      await this.autoload(denops, "ui", name);
    }

    return this.#exts.ui[name];
  }
  async getSource(
    denops: Denops,
    name: SourceName,
  ): Promise<BaseSource<BaseParams> | null> {
    if (!this.#exts.source[name]) {
      await this.autoload(denops, "source", name);
    }

    return this.#exts.source[name];
  }
  async getFilter(
    denops: Denops,
    name: FilterName,
  ): Promise<BaseFilter<BaseParams> | null> {
    if (!this.#exts.filter[name]) {
      await this.autoload(denops, "filter", name);
    }

    return this.#exts.filter[name];
  }
}

async function createPathCache(
  denops: Denops,
  runtimepath: string,
): Promise<Map<string, string>> {
  const extFileGlob = await globpath(
    denops,
    runtimepath,
    `${TYPE_DIR_PATTERN}/*.ts`,
  );
  const extDirEntryPointGlob = await globpath(
    denops,
    runtimepath,
    `${TYPE_DIR_PATTERN}/*/${EXT_ENTRY_POINT_FILE}`,
  );

  // Create key paths for both single-file and directory entry points.
  // Prioritize the first occurrence key in keyPaths.
  const keyPaths: Readonly<[key: string, path: string]>[] = [
    //   1. `{name}.ts`
    ...extFileGlob.map((extFile) => {
      const { name, dir: typeDir } = parse(extFile);
      const typeDirName = basename(typeDir);
      const key = `${typeDirName}/${name}`;
      return [key, extFile] as const;
    }),
    //   2. `{name}/main.ts`
    ...extDirEntryPointGlob.map((entryPoint) => {
      const extDir = dirname(entryPoint);
      const { base: name, dir: typeDir } = parse(extDir);
      const typeDirName = basename(typeDir);
      const key = `${typeDirName}/${name}`;
      return [key, extDir] as const;
    }),
  ];

  // Remove duplicate keys.
  // Note that `Map` prioritizes the later value, so need to reversed.
  const cache = new Map(keyPaths.toReversed());

  return cache;
}

async function globpath(
  denops: Denops,
  path: string,
  pattern: string,
): Promise<string[]> {
  return await fn.globpath(denops, path, pattern, 1, 1) as unknown as string[];
}
