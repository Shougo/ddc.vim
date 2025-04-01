import { Ddc } from "./ddc.ts";
import { ContextBuilderImpl } from "./context.ts";
import type {
  BaseParams,
  ContextCallbacks,
  DdcEvent,
  DdcExtType,
  DdcItem,
  DdcOptions,
  FilterOptions,
  Item,
  PreviewContext,
  Previewer,
  UserOptions,
} from "./types.ts";
import { Loader } from "./loader.ts";
import { isDenoCacheIssueError } from "./utils.ts";
import { createCallbackContext } from "./callback.ts";
import { getFilter, getPreviewer, onCompleteDone, onEvent } from "./ext.ts";
import type { BaseUi } from "./base/ui.ts";
import type { BaseSource } from "./base/source.ts";
import type { BaseFilter } from "./base/filter.ts";

import type { Denops, Entrypoint } from "jsr:@denops/std@~7.5.0";
import * as vars from "jsr:@denops/std@~7.5.0/variable";

import { ensure } from "jsr:@core/unknownutil@~4.3.0/ensure";
import { is } from "jsr:@core/unknownutil@~4.3.0/is";
import { Lock } from "jsr:@core/asyncutil@~1.2.0/lock";
import { toFileUrl } from "jsr:@std/path@~1.0.2/to-file-url";

export const main: Entrypoint = (denops: Denops) => {
  const loader = new Loader();
  const ddc = new Ddc(loader);
  const contextBuilder = new ContextBuilderImpl();
  const cbContext = createCallbackContext();
  const lock = new Lock(0);
  let queuedEvent: DdcEvent | null = null;

  const setAlias = (extType: DdcExtType, alias: string, base: string) => {
    loader.registerAlias(extType, alias, base);
  };

  const sourceNameFromItem = async (item: DdcItem) => {
    if (item.__sourceName) {
      return item.__sourceName;
    }

    // Get source name from previous items
    const items = await vars.g.get(denops, "ddc#_items") as DdcItem[];
    const sourceItems = items.filter(
      (i) =>
        i.word === item.word && i.abbr === item.abbr && i.kind === item.kind &&
        i.menu === item.menu,
    );

    if (sourceItems.length === 0) {
      return "";
    }

    return sourceItems[0].__sourceName;
  };

  denops.dispatcher = {
    alias(arg1: unknown, arg2: unknown, arg3: unknown): Promise<void> {
      setAlias(
        ensure(arg1, is.String) as DdcExtType,
        ensure(arg2, is.String),
        ensure(arg3, is.String),
      );
      return Promise.resolve();
    },
    async registerPath(arg1: unknown, arg2: unknown): Promise<void> {
      await loader.registerPath(
        ensure(arg1, is.String) as DdcExtType,
        ensure(arg2, is.String),
      );
      return Promise.resolve();
    },
    registerExtension(
      arg1: unknown,
      arg2: unknown,
      arg3: unknown,
    ): Promise<void> {
      const type = ensure(arg1, is.String);
      const extName = ensure(arg2, is.String);

      switch (type) {
        case "ui":
          loader.registerExtension(type, extName, arg3 as BaseUi<BaseParams>);
          break;
        case "source":
          loader.registerExtension(
            type,
            extName,
            arg3 as BaseSource<BaseParams>,
          );
          break;
        case "filter":
          loader.registerExtension(
            type,
            extName,
            arg3 as BaseFilter<BaseParams>,
          );
          break;
      }

      return Promise.resolve();
    },
    setGlobal(arg1: unknown): Promise<void> {
      const options = ensure(arg1, is.Record) as Partial<DdcOptions>;
      contextBuilder.setGlobal(options);
      return Promise.resolve();
    },
    setFiletype(arg1: unknown, arg2: unknown): Promise<void> {
      const options = ensure(arg1, is.Record) as Partial<DdcOptions>;
      const filetype = ensure(arg2, is.String) as string;
      contextBuilder.setFiletype(filetype, options);
      return Promise.resolve();
    },
    setBuffer(arg1: unknown, arg2: unknown): Promise<void> {
      const options = ensure(arg1, is.Record) as Partial<DdcOptions>;
      const bufnr = ensure(arg2, is.Number) as number;
      contextBuilder.setBuffer(bufnr, options);
      return Promise.resolve();
    },
    setContextGlobal(arg1: unknown): Promise<void> {
      const callback = ensure(arg1, is.String) as string;
      contextBuilder.setContextGlobal(callback);
      return Promise.resolve();
    },
    setContextFiletype(arg1: unknown, arg2: unknown): Promise<void> {
      const callback = ensure(arg1, is.String) as string;
      const filetype = ensure(arg2, is.String) as string;
      contextBuilder.setContextFiletype(callback, filetype);
      return Promise.resolve();
    },
    setContextBuffer(arg1: unknown, arg2: unknown): Promise<void> {
      const callback = ensure(arg1, is.String) as string;
      const bufnr = ensure(arg2, is.Number) as number;
      contextBuilder.setContextBuffer(callback, bufnr);
      return Promise.resolve();
    },
    patchGlobal(arg1: unknown): Promise<void> {
      const options = ensure(arg1, is.Record) as Partial<DdcOptions>;
      contextBuilder.patchGlobal(options);
      return Promise.resolve();
    },
    patchFiletype(arg1: unknown, arg2: unknown): Promise<void> {
      const options = ensure(arg1, is.Record) as Partial<DdcOptions>;
      const filetype = ensure(arg2, is.String) as string;
      contextBuilder.patchFiletype(filetype, options);
      return Promise.resolve();
    },
    patchBuffer(arg1: unknown, arg2: unknown): Promise<void> {
      const options = ensure(arg1, is.Record) as Partial<DdcOptions>;
      const bufnr = ensure(arg2, is.Number) as number;
      contextBuilder.patchBuffer(bufnr, options);
      return Promise.resolve();
    },
    getGlobal(): Promise<Partial<DdcOptions>> {
      return Promise.resolve(contextBuilder.getGlobal());
    },
    getFiletype(): Promise<Record<string, Partial<DdcOptions>>> {
      return Promise.resolve(contextBuilder.getFiletype());
    },
    getBuffer(): Promise<Record<number, Partial<DdcOptions>>> {
      return Promise.resolve(contextBuilder.getBuffer());
    },
    getContext(): Promise<ContextCallbacks> {
      return Promise.resolve(contextBuilder.getContext());
    },
    getCurrent(): Promise<DdcOptions> {
      return Promise.resolve(contextBuilder.getCurrent(denops));
    },
    async getPreviewer(arg1: unknown, arg2: unknown): Promise<Previewer> {
      const [_skip, context, options] = await contextBuilder
        .createContext(denops, "Manual");
      const item = ensure(arg1, is.Record) as DdcItem;
      const sourceName = await sourceNameFromItem(item);
      const previewContext = ensure(arg2, is.Record) as PreviewContext;
      return await getPreviewer(
        denops,
        loader,
        context,
        options,
        item,
        sourceName,
        previewContext,
      );
    },
    async loadConfig(arg1: unknown): Promise<void> {
      await lock.lock(async () => {
        const path = ensure(arg1, is.String) as string;
        try {
          // NOTE: Import module with fragment so that reload works properly.
          // https://github.com/vim-denops/denops.vim/issues/227
          const mod = await import(
            `${toFileUrl(path).href}#${performance.now()}`
          );
          const obj = new mod.Config();
          await obj.config({ denops, contextBuilder, setAlias });
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
      return Promise.resolve();
    },
    async manualComplete(arg1: unknown): Promise<void> {
      // Get current options
      let [skip, context, options] = await contextBuilder
        .createContext(denops, "Manual");

      // Hide the current completion
      await ddc.hide(denops, context, options);

      const userOptions = ensure(arg1, is.Record) as UserOptions;

      // Update options
      [skip, context, options] = await contextBuilder
        .createContext(denops, "Manual", userOptions);
      if (skip) return;

      cbContext.revoke();

      await ddc.doCompletion(denops, context, cbContext, options);
    },
    async updateItems(arg1: unknown, arg2: unknown): Promise<void> {
      const name = ensure(arg1, is.String) as string;
      const items = ensure(arg2, is.Array) as Item[];

      ddc.updateItems(name, items);

      const [skip, context, options] = await contextBuilder
        .createContext(denops, "Update");
      if (skip) return;

      cbContext.revoke();

      await ddc.doCompletion(denops, context, cbContext, options);
    },
    async onEvent(arg1: unknown): Promise<void> {
      queuedEvent = ensure(arg1, is.String) as DdcEvent;

      // NOTE: must be locked
      await lock.lock(async () => {
        while (queuedEvent !== null) {
          const event = queuedEvent;
          queuedEvent = null;
          await _onEvent(event);
        }
      });
    },
    onCallback(id: unknown, payload: unknown): Promise<void> {
      cbContext.emit(ensure(id, is.String), payload);
      return Promise.resolve();
    },
    async onCompleteDone(arg1: unknown): Promise<void> {
      const item = ensure(arg1, is.Record) as DdcItem;
      const sourceName = await sourceNameFromItem(item);
      const [skip, context, options] = await contextBuilder
        .createContext(denops, "CompleteDone");
      if (skip || sourceName.length === 0) return;

      // Convert to UserSource
      const userSource =
        options.sources.find((source) =>
          (typeof source === "object" && "name" in source
            ? source.name
            : source) === sourceName
        ) ?? sourceName;

      cbContext.revoke();
      await onCompleteDone(
        denops,
        loader,
        context,
        cbContext.createOnCallback(),
        options,
        userSource,
        item.user_data,
      );
    },
    async show(arg1: unknown): Promise<void> {
      const ui = ensure(arg1, is.String) as string;

      const [_, context, options] = await contextBuilder.createContext(
        denops,
        "Manual",
      );
      options.ui = ui;

      const completePos = await vars.g.get(
        denops,
        "ddc#_complete_pos",
        -1,
      ) as number;
      const items = await vars.g.get(denops, "ddc#_items", []) as DdcItem[];

      await ddc.show(denops, context, options, completePos, items);
    },
    async hide(arg1: unknown): Promise<void> {
      const event = ensure(arg1, is.String) as DdcEvent;

      const [_, context, options] = await contextBuilder.createContext(
        denops,
        event,
      );
      await ddc.hide(denops, context, options);
    },
    async visible(): Promise<boolean> {
      const [_, context, options] = await contextBuilder.createContext(
        denops,
        "Manual",
      );
      return await ddc.visible(denops, context, options);
    },
    async getFilter(arg1: unknown): Promise<
      [
        string,
        FilterOptions,
        BaseParams,
      ]
    > {
      const filterName = ensure(arg1, is.String) as string;
      const [_, _context, options] = await contextBuilder.createContext(
        denops,
        "Manual",
      );
      const [filter, filterOptions, filterParams] = await getFilter(
        denops,
        loader,
        options,
        filterName,
      );
      return [filter?.path ?? "", filterOptions, filterParams];
    },
  };

  async function _onEvent(event: DdcEvent): Promise<void> {
    const [skip, context, options] = await contextBuilder
      .createContext(denops, event);

    await ddc.checkManualCompletion(denops, context, options, event);

    await onEvent(
      denops,
      loader,
      context,
      cbContext.createOnCallback(),
      options,
    );

    if (skip) return;

    cbContext.revoke();

    if (await ddc.checkSkipCompletion(denops, context, options)) {
      return;
    }

    // Check auto complete delay.
    if (options.autoCompleteDelay > 0) {
      // Cancel previous completion
      await ddc.cancelCompletion(denops, context, options);

      await new Promise((resolve) =>
        setTimeout(
          resolve,
          options.autoCompleteDelay,
        )
      );
    }

    if (options.hideOnEvents || event === "Update") {
      // Hide the current completion
      await ddc.hide(denops, context, options);
    }

    await ddc.doCompletion(denops, context, cbContext, options);
  }

  ddc.initialize(denops);
};
