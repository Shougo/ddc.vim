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
import { Denops, fn, Lock, op, parse, toFileUrl } from "./deps.ts";

export class Loader {
  private uis: Record<UiName, BaseUi<BaseUiParams>> = {};
  private sources: Record<SourceName, BaseSource<BaseSourceParams>> = {};
  private filters: Record<FilterName, BaseFilter<BaseFilterParams>> = {};
  private aliases: Record<DdcExtType, Record<string, string>> = {
    ui: {},
    source: {},
    filter: {},
  };
  private checkPaths: Record<string, boolean> = {};
  private registerLock = new Lock(0);

  async autoload(
    denops: Denops,
    type: DdcExtType,
    name: string,
  ) {
    const paths = await globpath(
      denops,
      `denops/@ddc-${type}s/`,
      this.getAlias(type, name) ?? name,
    );

    if (paths.length === 0) {
      return;
    }

    await this.registerPath(type, paths[0]);
  }

  registerAlias(type: DdcExtType, alias: string, base: string) {
    this.aliases[type][alias] = base;
  }

  async registerPath(type: DdcExtType, path: string) {
    await this.registerLock.lock(async () => {
      await this.register(type, path);
    });
  }

  getAliasNames(type: DdcExtType) {
    return Object.keys(this.aliases[type]);
  }
  getAlias(type: DdcExtType, name: string) {
    return this.aliases[type][name];
  }
  getUi(name: UiName) {
    return this.uis[name];
  }
  getSource(name: SourceName) {
    return this.sources[name];
  }
  getFilter(name: FilterName) {
    return this.filters[name];
  }

  private async register(type: DdcExtType, path: string) {
    if (path in this.checkPaths) {
      return;
    }

    const name = parse(path).name;

    const mod = await import(toFileUrl(path).href);

    let add;
    switch (type) {
      case "ui":
        add = (name: string) => {
          const ui = new mod.Ui();
          ui.name = name;
          this.uis[ui.name] = ui;
        };
        break;
      case "source":
        add = (name: string) => {
          const source = new mod.Source();
          source.name = name;
          this.sources[source.name] = source;
        };
        break;
      case "filter":
        add = (name: string) => {
          const filter = new mod.Filter();
          filter.name = name;
          this.filters[filter.name] = filter;
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

    this.checkPaths[path] = true;
  }
}

async function globpath(
  denops: Denops,
  search: string,
  file: string,
): Promise<string[]> {
  const runtimepath = await op.runtimepath.getGlobal(denops);

  const check: Record<string, boolean> = {};
  const paths: string[] = [];
  const glob = await fn.globpath(
    denops,
    runtimepath,
    search + file + ".ts",
    1,
    1,
  );

  for (const path of glob) {
    // Skip already added name.
    if (parse(path).name in check) {
      continue;
    }

    paths.push(path);
    check[parse(path).name] = true;
  }

  return paths;
}
