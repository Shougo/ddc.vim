import {
  BaseFilter,
  BaseFilterParams,
  BaseSource,
  BaseSourceParams,
  BaseUi,
  BaseUiParams,
  DdcExtType,
} from "./types.ts";
import { Lock, parse, toFileUrl } from "./deps.ts";

export class Loader {
  private uis: Record<string, BaseUi<BaseUiParams>> = {};
  private sources: Record<string, BaseSource<BaseSourceParams>> = {};
  private filters: Record<string, BaseFilter<BaseFilterParams>> = {};
  private aliases: Record<DdcExtType, Record<string, string>> = {
    ui: {},
    source: {},
    filter: {},
  };
  private checkPaths: Record<string, boolean> = {};
  private registerLock = new Lock(0);

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
  getUi(name: string) {
    return this.uis[name];
  }
  getSource(name: string) {
    return this.sources[name];
  }
  getFilter(name: string) {
    return this.filters[name];
  }

  removeSource(name: string) {
    delete this.sources[name];
  }
  removeFilter(name: string) {
    delete this.filters[name];
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
