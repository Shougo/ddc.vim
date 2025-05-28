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
import { isDenoCacheIssueError } from "./utils.ts";

import type { Denops } from "jsr:@denops/std@~7.5.0";
import * as op from "jsr:@denops/std@~7.5.0/option";
import * as fn from "jsr:@denops/std@~7.5.0/function";

import { basename } from "jsr:@std/path@~1.1.0/basename";
import { parse } from "jsr:@std/path@~1.1.0/parse";
import { is } from "jsr:@core/unknownutil@~4.3.0/is";
import { toFileUrl } from "jsr:@std/path@~1.1.0/to-file-url";
import { Lock } from "jsr:@core/asyncutil@~1.2.0/lock";

type Ext = {
  ui: Record<string, BaseUi<BaseParams>>;
  source: Record<string, BaseSource<BaseParams>>;
  filter: Record<string, BaseFilter<BaseParams>>;
};

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
  #cachedPaths: Record<string, string> = {};
  #prevRuntimepath = "";

  async autoload(
    denops: Denops,
    type: DdcExtType,
    name: string,
  ): Promise<boolean> {
    const runtimepath = await op.runtimepath.getGlobal(denops);
    if (runtimepath !== this.#prevRuntimepath) {
      const cached = await globpath(
        denops,
        "denops/@ddc-*s",
      );
      // NOTE: glob may be invalid.
      if (Object.keys(cached).length > 0) {
        this.#cachedPaths = cached;
      }
      this.#prevRuntimepath = runtimepath;
    }

    const key = `@ddc-${type}s/${this.getAlias(type, name) ?? name}`;

    if (!this.#cachedPaths[key]) {
      return this.#prevRuntimepath === "";
    }

    await this.registerPath(type, this.#cachedPaths[key]);

    // NOTE: this.#prevRuntimepath may be true if initialized.
    // NOTE: If not found, it returns false, .
    return this.#prevRuntimepath === "" || this.#cachedPaths[key] !== undefined;
  }

  registerAlias(type: DdcExtType, alias: string, base: string) {
    this.#aliases[type][alias] = base;
  }

  async registerPath(type: DdcExtType, path: string) {
    await this.#registerLock.lock(async () => {
      try {
        await this.#register(type, path);
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
    });
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

  async #register(type: DdcExtType, path: string) {
    if (path in this.#checkPaths) {
      return;
    }

    const name = parse(path).name;

    const mod = await import(toFileUrl(path).href);

    const typeExt = this.#exts[type];
    let add;
    switch (type) {
      case "ui":
        add = (name: string) => {
          const ext = new mod.Ui();
          ext.name = name;
          ext.path = path;
          typeExt[name] = ext;
        };
        break;
      case "source":
        add = (name: string) => {
          const ext = new mod.Source();
          ext.name = name;
          ext.path = path;
          typeExt[name] = ext;
        };
        break;
      case "filter":
        add = (name: string) => {
          const ext = new mod.Filter();
          ext.name = name;
          ext.path = path;
          typeExt[name] = ext;
        };
        break;
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
  }
}

async function globpath(
  denops: Denops,
  search: string,
): Promise<Record<string, string>> {
  const runtimepath = await op.runtimepath.getGlobal(denops);

  const paths: Record<string, string> = {};
  const glob = await fn.globpath(
    denops,
    runtimepath,
    search + "/*.ts",
    1,
    1,
  );

  if (is.Array(glob)) {
    // NOTE: glob may be invalid.
    for (const path of glob) {
      // Skip already added name.
      const parsed = parse(path);
      const key = `${basename(parsed.dir)}/${parsed.name}`;
      if (key in paths) {
        continue;
      }

      paths[key] = path;
    }
  }

  return paths;
}
