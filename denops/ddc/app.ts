import { Ddc } from "./ddc.ts";
import { ContextBuilder, ContextCallbacks } from "./context.ts";
import {
  Context,
  DdcEvent,
  DdcExtType,
  DdcItem,
  DdcOptions,
  DdcUserData,
  Item,
  UserOptions,
} from "./types.ts";
import {
  batch,
  Denops,
  ensure,
  is,
  Lock,
  op,
  toFileUrl,
  vars,
} from "./deps.ts";
import { Loader } from "./loader.ts";
import { createCallbackContext } from "./callback.ts";

export function main(denops: Denops) {
  const loader = new Loader();
  const ddc = new Ddc(loader);
  const contextBuilder = new ContextBuilder();
  const cbContext = createCallbackContext();
  const lock = new Lock(0);
  let queuedEvent: DdcEvent | null = null;
  let prevInput = "";

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
      const id = ensure(arg1, is.String);
      contextBuilder.setContextGlobal(id);
      return Promise.resolve();
    },
    setContextFiletype(arg1: unknown, arg2: unknown): Promise<void> {
      const id = ensure(arg1, is.String);
      const filetype = ensure(arg2, is.String);
      contextBuilder.setContextFiletype(id, filetype);
      return Promise.resolve();
    },
    setContextBuffer(arg1: unknown, arg2: unknown): Promise<void> {
      const id = ensure(arg1, is.String);
      const bufnr = ensure(arg2, is.Number);
      contextBuilder.setContextBuffer(id, bufnr);
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
        const mod = await import(toFileUrl(path).href);
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
      await doCompletion(denops, context, options);
    },
    async updateItems(arg1: unknown, arg2: unknown): Promise<void> {
      const name = ensure(arg1, is.String);
      const items = ensure(arg2, is.Array) as Item[];

      ddc.updateItems(name, items);

      const [skip, context, options] = await contextBuilder
        .createContext(denops, "Update");
      if (skip) return;

      cbContext.revoke();
      await doCompletion(denops, context, options);
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
    if (visible && ddc.prevUi !== "") {
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

    if (event !== "InsertEnter" && context.mode === "n") {
      return;
    }

    if (await checkSkipCompletion(event, context, options)) {
      return;
    }

    const skipCompletion = await ddc.skipCompletion(denops, context, options);
    if (skipCompletion) {
      return;
    }

    // Check auto complete delay.
    if (options.autoCompleteDelay > 0) {
      // Cancel previous completion
      await cancelCompletion(denops, context, options);

      await new Promise((resolve) =>
        setTimeout(
          resolve,
          options.autoCompleteDelay,
        )
      );
    }

    await doCompletion(denops, context, options);
  }

  async function checkSkipCompletion(
    event: DdcEvent,
    context: Context,
    options: DdcOptions,
  ): Promise<boolean> {
    // NOTE: Don't complete when backspace by default, because of completion
    // flicker.
    const checkBackSpace = !options.backspaceCompletion &&
      context.input !== prevInput &&
      context.input.length + 1 === prevInput.length &&
      prevInput.startsWith(context.input);
    if (checkBackSpace) {
      prevInput = context.input;
      return true;
    }

    // Skip special buffers.
    const buftype = await op.buftype.getLocal(denops);
    if (
      buftype !== "" && !options.specialBufferCompletion && context.mode !== "c"
    ) {
      return true;
    }

    if (options.autoCompleteEvents.indexOf(event) < 0) {
      return true;
    }

    return false;
  }

  async function cancelCompletion(
    denops: Denops,
    context: Context,
    options: DdcOptions,
  ): Promise<void> {
    await batch(denops, async (denops: Denops) => {
      await vars.g.set(denops, "ddc#_complete_pos", -1);
      await vars.g.set(denops, "ddc#_items", []);
      await ddc.hide(denops, context, options);
    });
  }

  async function doCompletion(
    denops: Denops,
    context: Context,
    options: DdcOptions,
  ): Promise<void> {
    const [completePos, items] = await ddc.gatherResults(
      denops,
      context,
      cbContext.createOnCallback(),
      options,
    );

    const changedTick = vars.b.get(denops, "changedtick") as Promise<number>;
    if (context.changedTick !== await changedTick) {
      // Input is changed.  Skip invalid completion.
      await cancelCompletion(denops, context, options);
      return;
    }

    await (async function write() {
      prevInput = context.input;
      await batch(denops, async (denops: Denops) => {
        await vars.g.set(denops, "ddc#_changedtick", context.changedTick);
        await vars.g.set(denops, "ddc#_complete_pos", completePos);
        await vars.g.set(denops, "ddc#_items", items);
        await vars.g.set(denops, "ddc#_sources", options.sources);
      });

      if (items.length === 0) {
        await ddc.hide(denops, context, options);
      } else {
        await ddc.show(denops, context, options, completePos, items);
      }
    })();
  }

  batch(denops, async (denops: Denops) => {
    await vars.g.set(denops, "ddc#_changedtick", 0);
    await vars.g.set(denops, "ddc#_complete_pos", -1);
    await vars.g.set(denops, "ddc#_items", []);
    await vars.g.set(denops, "ddc#_sources", []);

    await denops.call("ddc#on_event", "Initialize");

    ddc.registerAutocmd(denops, [
      "BufEnter",
      "BufLeave",
      "FileType",
      "InsertEnter",
      "InsertLeave",
      "TextChangedI",
      "TextChangedP",
    ]);
    await denops.cmd(
      "autocmd ddc CmdlineChanged * " +
        ": if getcmdtype() ==# '=' || getcmdtype() ==# '@'" +
        "|   call ddc#on_event('CmdlineChanged')" +
        "| endif",
    );
  });
}
