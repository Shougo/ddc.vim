import {
  BaseFilter,
  BaseFilterParams,
  BaseSource,
  BaseSourceParams,
  BaseUi,
  BaseUiParams,
  DdcExtType,
  FilterName,
  SourceName,
  UiName,
} from "./types.ts";
import {
  basename,
  Denops,
  fn,
  is,
  Lock,
  op,
  parse,
  toFileUrl,
  vars,
} from "./deps.ts";
import { mods } from "./_mods.js";

export class Loader {
  #uis: Record<UiName, BaseUi<BaseUiParams>> = {};
  #sources: Record<SourceName, BaseSource<BaseSourceParams>> = {};
  #filters: Record<FilterName, BaseFilter<BaseFilterParams>> = {};
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
      await vars.g.get(denops, "ddc#_mods"),
      staticLines.join("\n"),
    );
  }

  async autoload(
    denops: Denops,
    type: DdcExtType,
    name: string,
  ) {
    const runtimepath = await op.runtimepath.getGlobal(denops);
    if (runtimepath !== this.#prevRuntimepath) {
      this.#cachedPaths = await globpath(
        denops,
        "denops/@ddc-*s",
      );
      this.#prevRuntimepath = runtimepath;
    }

    const key = `@ddc-${type}s/${this.getAlias(type, name) ?? name}`;

    if (!this.#cachedPaths[key]) {
      return;
    }

    await this.registerPath(type, this.#cachedPaths[key]);
  }

  registerAlias(type: DdcExtType, alias: string, base: string) {
    this.#aliases[type][alias] = base;
  }

  async registerPath(type: DdcExtType, path: string) {
    await this.#registerLock.lock(async () => {
      await this.#register(type, path);
    });
  }

  getAliasNames(type: DdcExtType) {
    return Object.keys(this.#aliases[type]);
  }
  getAlias(type: DdcExtType, name: string) {
    return this.#aliases[type][name];
  }
  getUi(name: UiName) {
    return this.#uis[name];
  }
  getSource(name: SourceName) {
    return this.#sources[name];
  }
  getFilter(name: FilterName) {
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
          this.#uis[ui.name] = ui;
        };
        break;
      case "source":
        add = (name: string) => {
          const source = new mod.Source();
          source.name = name;
          this.#sources[source.name] = source;
        };
        break;
      case "filter":
        add = (name: string) => {
          const filter = new mod.Filter();
          filter.name = name;
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
