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
import { mods } from "./_mods.js";

import type { Denops } from "jsr:@denops/std@~7.2.0";
import * as op from "jsr:@denops/std@~7.2.0/option";
import * as fn from "jsr:@denops/std@~7.2.0/function";

import { basename } from "jsr:@std/path@~1.0.2/basename";
import { parse } from "jsr:@std/path@~1.0.2/parse";
import { is } from "jsr:@core/unknownutil@~4.3.0/is";
import { toFileUrl } from "jsr:@std/path@~1.0.2/to-file-url";
import { Lock } from "jsr:@core/asyncutil@~1.2.0/lock";

export class Loader {
  #uis: Record<UiName, BaseUi<BaseParams>> = {};
  #sources: Record<SourceName, BaseSource<BaseParams>> = {};
  #filters: Record<FilterName, BaseFilter<BaseParams>> = {};
  #aliases: Record<DdcExtType, Record<string, string>> = {
    ui: {},
    source: {},
    filter: {},
  };
  #checkPaths: Record<string, boolean> = {};
  #registerLock = new Lock(0);
  #cachedPaths: Record<string, string> = {};
  #prevRuntimepath = "";

  async initStaticImportPath(denops: Denops) {
    // Generate _mods.ts
    let mods: string[] = [];
    const runtimepath = await op.runtimepath.getGlobal(denops);
    for (
      const glob of [
        "denops/@ddc-filters/*.ts",
        "denops/@ddc-sources/*.ts",
        "denops/@ddc-uis/*.ts",
      ]
    ) {
      mods = mods.concat(
        await fn.globpath(
          denops,
          runtimepath,
          glob,
          1,
          1,
        ),
      );
    }

    const staticLines = [];
    for (const [index, path] of mods.entries()) {
      staticLines.push(
        `import * as mod${index} from "${toFileUrl(path).href}"`,
      );
    }
    staticLines.push("export const mods = {");
    for (const [index, path] of mods.entries()) {
      staticLines.push(`  "${toFileUrl(path).href}":`);
      staticLines.push(`    mod${index},`);
    }
    staticLines.push("};");
    await Deno.writeTextFile(
      await denops.call("ddc#denops#_mods") as string,
      staticLines.join("\n"),
    );
  }

  async autoload(
    denops: Denops,
    type: DdcExtType,
    name: string,
  ) {
    await this.#cachePaths(denops);

    const key = `@ddc-${type}s/${this.getAlias(type, name) ?? name}`;

    if (!this.#cachedPaths[key]) {
      return;
    }

    await this.registerPath(type, this.#cachedPaths[key]);
  }

  async exists(
    denops: Denops,
    type: DdcExtType,
    name: string,
  ): Promise<boolean> {
    await this.#cachePaths(denops);

    const key = `@ddc-${type}s/${this.getAlias(type, name) ?? name}`;

    return this.#cachedPaths[key] !== undefined;
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

  getAliasNames(type: DdcExtType): string[] {
    return Object.keys(this.#aliases[type]);
  }
  getAlias(type: DdcExtType, name: string): string {
    return this.#aliases[type][name];
  }
  getUi(name: UiName): BaseUi<BaseParams> {
    return this.#uis[name];
  }
  getSource(name: SourceName): BaseSource<BaseParams> {
    return this.#sources[name];
  }
  getFilter(name: FilterName): BaseFilter<BaseParams> {
    return this.#filters[name];
  }

  async #register(type: DdcExtType, path: string) {
    if (path in this.#checkPaths) {
      return;
    }

    const name = parse(path).name;

    const mod = (mods as Record<string, unknown>)[toFileUrl(path).href] ??
      await import(toFileUrl(path).href);

    let add;
    switch (type) {
      case "ui":
        add = (name: string) => {
          const ui = new mod.Ui();
          ui.name = name;
          ui.path = path;
          this.#uis[ui.name] = ui;
        };
        break;
      case "source":
        add = (name: string) => {
          const source = new mod.Source();
          source.name = name;
          source.path = path;
          this.#sources[source.name] = source;
        };
        break;
      case "filter":
        add = (name: string) => {
          const filter = new mod.Filter();
          filter.name = name;
          filter.path = path;
          this.#filters[filter.name] = filter;
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

  async #cachePaths(denops: Denops) {
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
