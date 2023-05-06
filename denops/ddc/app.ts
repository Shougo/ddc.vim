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
  ensureArray,
  ensureNumber,
  ensureObject,
  ensureString,
  fn,
  Lock,
  op,
  vars,
} from "./deps.ts";
import { createCallbackContext } from "./callback.ts";

export async function main(denops: Denops) {
  const ddc: Ddc = new Ddc();
  const contextBuilder = new ContextBuilder();
  const cbContext = createCallbackContext();
  const lock = new Lock(0);
  let queuedEvent: DdcEvent | null = null;

  denops.dispatcher = {
    alias(arg1: unknown, arg2: unknown, arg3: unknown): Promise<void> {
      ddc.registerAlias(
        ensureString(arg1) as DdcExtType,
        ensureString(arg2),
        ensureString(arg3),
      );
      return Promise.resolve();
    },
    setGlobal(arg1: unknown): Promise<void> {
      const options = ensureObject(arg1);
      contextBuilder.setGlobal(options);
      return Promise.resolve();
    },
    setFiletype(arg1: unknown, arg2: unknown): Promise<void> {
      const options = ensureObject(arg1);
      const filetype = ensureString(arg2);
      contextBuilder.setFiletype(filetype, options);
      return Promise.resolve();
    },
    setBuffer(arg1: unknown, arg2: unknown): Promise<void> {
      const options = ensureObject(arg1);
      const bufnr = ensureNumber(arg2);
      contextBuilder.setBuffer(bufnr, options);
      return Promise.resolve();
    },
    setContextGlobal(arg1: unknown): Promise<void> {
      const id = ensureString(arg1);
      contextBuilder.setContextGlobal(id);
      return Promise.resolve();
    },
    setContextFiletype(arg1: unknown, arg2: unknown): Promise<void> {
      const id = ensureString(arg1);
      const filetype = ensureString(arg2);
      contextBuilder.setContextFiletype(id, filetype);
      return Promise.resolve();
    },
    setContextBuffer(arg1: unknown, arg2: unknown): Promise<void> {
      const id = ensureString(arg1);
      const bufnr = ensureNumber(arg2);
      contextBuilder.setContextBuffer(id, bufnr);
      return Promise.resolve();
    },
    patchGlobal(arg1: unknown): Promise<void> {
      const options = ensureObject(arg1);
      contextBuilder.patchGlobal(options);
      return Promise.resolve();
    },
    patchFiletype(arg1: unknown, arg2: unknown): Promise<void> {
      const options = ensureObject(arg1);
      const filetype = ensureString(arg2);
      contextBuilder.patchFiletype(filetype, options);
      return Promise.resolve();
    },
    patchBuffer(arg1: unknown, arg2: unknown): Promise<void> {
      const options = ensureObject(arg1);
      const bufnr = ensureNumber(arg2);
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
    async manualComplete(arg1: unknown): Promise<void> {
      // Get current options
      let [skip, context, options] = await contextBuilder
        .createContext(denops, "Manual");

      // Hide the current completion
      await ddc.hide(denops, context, options);

      const userOptions = ensureObject(arg1) as UserOptions;

      // Update options
      [skip, context, options] = await contextBuilder
        .createContext(denops, "Manual", userOptions);
      if (skip) return;

      if (context.mode === "c") {
        // Use cmdlineSources instead
        if (Array.isArray(options.cmdlineSources)) {
          options.sources = options.cmdlineSources;
        } else {
          const cmdType = await fn.getcmdtype(denops) as string;
          if (options.cmdlineSources[cmdType]) {
            options.sources = options.cmdlineSources[cmdType];
          }
        }
      }

      // Load sources
      await ddc.autoload(denops, "source", options.sources);

      cbContext.revoke();
      await doCompletion(denops, context, options);
    },
    async updateItems(arg1: unknown, arg2: unknown): Promise<void> {
      const name = ensureString(arg1);
      const items = ensureArray(arg2) as Item[];

      ddc.updateItems(name, items);

      const [skip, context, options] = await contextBuilder
        .createContext(denops, "Update");
      if (skip) return;

      cbContext.revoke();
      await doCompletion(denops, context, options);
    },
    async onEvent(arg1: unknown): Promise<void> {
      queuedEvent = ensureString(arg1) as DdcEvent;

      // Note: must be locked
      await lock.lock(async () => {
        while (queuedEvent !== null) {
          const event = queuedEvent;
          queuedEvent = null;
          await _onEvent(event);
        }
      });
    },
    // deno-lint-ignore require-await
    async onCallback(id: unknown, payload: unknown): Promise<void> {
      cbContext.emit(ensureString(id), payload);
    },
    async onCompleteDone(arg1: unknown, arg2: unknown): Promise<void> {
      const sourceName = ensureString(arg1);
      const userData = ensureObject(arg2) as DdcUserData;
      const [skip, context, options] = await contextBuilder
        .createContext(denops, "CompleteDone");
      if (skip) return;

      cbContext.revoke();
      await ddc.onCompleteDone(
        denops,
        context,
        cbContext.createOnCallback(),
        options,
        sourceName,
        userData,
      );
    },
    async show(arg1: unknown): Promise<void> {
      const ui = ensureString(arg1);

      const [_, context, options] = await contextBuilder.createContext(
        denops,
        "Manual",
      );
      options.ui = ui;

      // Load UI
      await ddc.autoload(denops, "ui", [options.ui]);

      const completePos = await vars.g.get(
        denops,
        "ddc#_complete_pos",
        -1,
      ) as number;
      const items = await vars.g.get(denops, "ddc#_items", []) as DdcItem[];

      await ddc.show(denops, context, options, completePos, items);
    },
    async hide(arg1: unknown): Promise<void> {
      const event = ensureString(arg1) as DdcEvent;

      const [_, context, options] = await contextBuilder.createContext(
        denops,
        event,
      );
      await ddc.hide(denops, context, options);
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
    } else if (context.mode === "c") {
      // Use cmdlineSources instead
      if (Array.isArray(options.cmdlineSources)) {
        options.sources = options.cmdlineSources;
      } else {
        const cmdType = await fn.getcmdtype(denops) as string;
        if (options.cmdlineSources[cmdType]) {
          options.sources = options.cmdlineSources[cmdType];
        }
      }
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

    const skipCompletion = await ddc.skipCompletion(denops, context, options);
    if (skipCompletion) {
      return;
    }

    if (await checkSkipCompletion(event, context, options)) {
      await cancelCompletion(denops, context, options);
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

      const changedTick = vars.b.get(denops, "changedtick") as Promise<
        number
      >;
      if (context.changedTick !== await changedTick) {
        // Input is changed.  Skip invalid completion.
        return;
      }
    }

    await doCompletion(denops, context, options);
  }

  async function checkSkipCompletion(
    event: DdcEvent,
    context: Context,
    options: DdcOptions,
  ): Promise<boolean> {
    // Note: Don't complete when backspace by default, because of completion
    // flicker.
    const prevInput = await vars.g.get(denops, "ddc#_prev_input") as string;
    const checkBackSpace = !options.backspaceCompletion &&
      context.input !== prevInput &&
      context.input.length + 1 === prevInput.length &&
      prevInput.startsWith(context.input);
    if (checkBackSpace) {
      await vars.g.set(denops, "ddc#_prev_input", context.input);
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

    await (async function write() {
      await batch(denops, async (denops: Denops) => {
        await vars.g.set(denops, "ddc#_changedtick", context.changedTick);
        await vars.g.set(denops, "ddc#_complete_pos", completePos);
        await vars.g.set(denops, "ddc#_items", items);
        await vars.g.set(denops, "ddc#_prev_input", context.input);
        await vars.g.set(denops, "ddc#_sources", options.sources);
      });

      if (items.length === 0) {
        await ddc.hide(denops, context, options);
      } else {
        await ddc.show(denops, context, options, completePos, items);
      }
    })();
  }

  await batch(denops, async (denops: Denops) => {
    await vars.g.set(denops, "ddc#_changedtick", 0);
    await vars.g.set(denops, "ddc#_complete_pos", -1);
    await vars.g.set(denops, "ddc#_items", []);
    await vars.g.set(denops, "ddc#_prev_input", "");
    await vars.g.set(denops, "ddc#_sources", []);

    await denops.cmd("doautocmd <nomodeline> User DDCReady");
    await denops.cmd("autocmd! User DDCReady");
    await denops.call("ddc#_on_event", "Initialize");

    ddc.registerAutocmd(denops, [
      "InsertEnter",
      "InsertLeave",
      "TextChangedI",
      "TextChangedP",
    ]);
    await denops.cmd(
      "autocmd ddc CmdlineChanged * " +
        ": if getcmdtype() ==# '=' || getcmdtype() ==# '@'" +
        "|   call ddc#_on_event('CmdlineChanged')" +
        "| endif",
    );
  });
}
