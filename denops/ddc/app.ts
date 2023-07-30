import { Ddc } from "./ddc.ts";
import { ContextBuilder, ContextCallbacks } from "./context.ts";
import {
  DdcEvent,
  DdcExtType,
  DdcItem,
  DdcOptions,
  DdcUserData,
  Item,
  UserOptions,
} from "./types.ts";
import { Denops, ensure, is, Lock, toFileUrl, vars } from "./deps.ts";
import { Loader } from "./loader.ts";
import { createCallbackContext } from "./callback.ts";

export function main(denops: Denops) {
  const loader = new Loader();
  const ddc = new Ddc(loader);
  const contextBuilder = new ContextBuilder();
  const cbContext = createCallbackContext();
  const lock = new Lock(0);
  let queuedEvent: DdcEvent | null = null;

  const setAlias = (extType: DdcExtType, alias: string, base: string) => {
    loader.registerAlias(extType, alias, base);
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
    async register(arg1: unknown, arg2: unknown): Promise<void> {
      await loader.registerPath(
        ensure(arg1, is.String) as DdcExtType,
        ensure(arg2, is.String),
      );
      return Promise.resolve();
    },
    setGlobal(arg1: unknown): Promise<void> {
      const options = ensure(arg1, is.Record);
      contextBuilder.setGlobal(options);
      return Promise.resolve();
    },
    setFiletype(arg1: unknown, arg2: unknown): Promise<void> {
      const options = ensure(arg1, is.Record);
      const filetype = ensure(arg2, is.String);
      contextBuilder.setFiletype(filetype, options);
      return Promise.resolve();
    },
    setBuffer(arg1: unknown, arg2: unknown): Promise<void> {
      const options = ensure(arg1, is.Record);
      const bufnr = ensure(arg2, is.Number);
      contextBuilder.setBuffer(bufnr, options);
      return Promise.resolve();
    },
    setContextGlobal(arg1: unknown): Promise<void> {
      const callback = ensure(arg1, is.String);
      contextBuilder.setContextGlobal(callback);
      return Promise.resolve();
    },
    setContextFiletype(arg1: unknown, arg2: unknown): Promise<void> {
      const callback = ensure(arg1, is.String);
      const filetype = ensure(arg2, is.String);
      contextBuilder.setContextFiletype(callback, filetype);
      return Promise.resolve();
    },
    setContextBuffer(arg1: unknown, arg2: unknown): Promise<void> {
      const callback = ensure(arg1, is.String);
      const bufnr = ensure(arg2, is.Number);
      contextBuilder.setContextBuffer(callback, bufnr);
      return Promise.resolve();
    },
    patchGlobal(arg1: unknown): Promise<void> {
      const options = ensure(arg1, is.Record);
      contextBuilder.patchGlobal(options);
      return Promise.resolve();
    },
    patchFiletype(arg1: unknown, arg2: unknown): Promise<void> {
      const options = ensure(arg1, is.Record);
      const filetype = ensure(arg2, is.String);
      contextBuilder.patchFiletype(filetype, options);
      return Promise.resolve();
    },
    patchBuffer(arg1: unknown, arg2: unknown): Promise<void> {
      const options = ensure(arg1, is.Record);
      const bufnr = ensure(arg2, is.Number);
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
    async loadConfig(arg1: unknown): Promise<void> {
      await lock.lock(async () => {
        const path = ensure(arg1, is.String);
        // NOTE: Import module with fragment so that reload works properly.
        // https://github.com/vim-denops/denops.vim/issues/227
        const mod = await import(
          `${toFileUrl(path).href}#${performance.now()}`
        );
        const obj = new mod.Config();
        await obj.config({ denops, contextBuilder, setAlias });
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
      const name = ensure(arg1, is.String);
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
    async onCompleteDone(arg1: unknown, arg2: unknown): Promise<void> {
      const sourceName = ensure(arg1, is.String);
      const userData = ensure(arg2, is.Record) as DdcUserData;
      const [skip, context, options] = await contextBuilder
        .createContext(denops, "CompleteDone");
      if (skip) return;

      // Convert to UserSource
      const userSource =
        options.sources.find((source) =>
          (is.Record(source) ? source.name : source) === sourceName
        ) ?? sourceName;

      cbContext.revoke();
      await ddc.onCompleteDone(
        denops,
        context,
        cbContext.createOnCallback(),
        options,
        userSource,
        userData,
      );
    },
    async show(arg1: unknown): Promise<void> {
      const ui = ensure(arg1, is.String);

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
  };

  async function _onEvent(event: DdcEvent): Promise<void> {
    const [skip, context, options] = await contextBuilder
      .createContext(denops, event);

    const visible = await ddc.visible(denops, context, options);
    if (
      visible && ddc.prevUi !== "" &&
      options.autoCompleteEvents.indexOf(event) > 0
    ) {
      // NOTE: If UI is visible, use prevSources/prevUi instead to update
      // current items
      options.sources = ddc.prevSources;
      options.ui = ddc.prevUi;
    }

    await ddc.onEvent(
      denops,
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

    await ddc.doCompletion(denops, context, cbContext, options);
  }

  ddc.initialize(denops);
}
