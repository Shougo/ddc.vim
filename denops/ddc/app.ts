import { Ddc } from "./ddc.ts";
import { ContextBuilder } from "./context.ts";
import { Context, DdcEvent, DdcOptions, DdcUserData } from "./types.ts";
import { batch, Denops, ensureObject, fn, op, vars } from "./deps.ts";

type RegisterArg = {
  path: string;
  name: string;
  type: "source" | "filter";
};

export async function main(denops: Denops) {
  const ddc: Ddc = new Ddc();
  const contextBuilder = new ContextBuilder();

  denops.dispatcher = {
    async register(arg1: unknown): Promise<void> {
      const arg = arg1 as RegisterArg;
      if (arg.type == "source") {
        await ddc.registerSource(denops, arg.path, arg.name);
      } else if (arg.type == "filter") {
        await ddc.registerFilter(denops, arg.path, arg.name);
      }
    },
    alias(arg1: unknown, arg2: unknown, arg3: unknown): Promise<void> {
      ddc.registerAlias(arg1 as string, arg2 as string, arg3 as string);
      return Promise.resolve();
    },
    setGlobal(arg1: unknown): Promise<void> {
      ensureObject(arg1);
      const options = arg1 as Record<string, unknown>;
      contextBuilder.setGlobal(options);
      return Promise.resolve();
    },
    setFiletype(arg1: unknown, arg2: unknown): Promise<void> {
      ensureObject(arg1);
      const options = arg1 as Record<string, unknown>;
      const filetype = arg2 as string;
      contextBuilder.setFiletype(filetype, options);
      return Promise.resolve();
    },
    setBuffer(arg1: unknown, arg2: unknown): Promise<void> {
      ensureObject(arg1);
      const options = arg1 as Record<string, unknown>;
      const bufnr = arg2 as number;
      contextBuilder.setBuffer(bufnr, options);
      return Promise.resolve();
    },
    patchGlobal(arg1: unknown): Promise<void> {
      ensureObject(arg1);
      const options = arg1 as Record<string, unknown>;
      contextBuilder.patchGlobal(options);
      return Promise.resolve();
    },
    patchFiletype(arg1: unknown, arg2: unknown): Promise<void> {
      ensureObject(arg1);
      const options = arg1 as Record<string, unknown>;
      const filetype = arg2 as string;
      contextBuilder.patchFiletype(filetype, options);
      return Promise.resolve();
    },
    patchBuffer(arg1: unknown, arg2: unknown): Promise<void> {
      ensureObject(arg1);
      const options = arg1 as Record<string, unknown>;
      const bufnr = arg2 as number;
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
    getCurrent(): Promise<DdcOptions> {
      return Promise.resolve(contextBuilder.getCurrent(denops));
    },
    async manualComplete(arg1: unknown): Promise<void> {
      const sources = arg1 as string[];

      const maybe = await contextBuilder.createContext(denops, "Manual");
      if (!maybe) return;
      const [context, options] = maybe;
      if (sources.length != 0) {
        options.sources = sources;
      }

      await doCompletion(denops, context, options);
    },
    async onEvent(arg1: unknown): Promise<void> {
      const event = arg1 as DdcEvent;
      const maybe = await contextBuilder.createContext(denops, event);
      if (!maybe) return;
      const [context, options] = maybe;

      await ddc.autoload(denops);

      await ddc.onEvent(
        denops,
        context,
        options,
      );

      if (event != "InsertEnter" && await fn.mode(denops) != "i") {
        return;
      }

      const isAutoComplete = event != "AutoRefresh" && event != "ManualRefresh";

      if (
        isAutoComplete && await checkSkipCompletion(event, context, options)
      ) {
        await cancelCompletion(denops, context);

        return;
      }

      // Check auto complete delay.
      if (isAutoComplete && options.autoCompleteDelay > 0) {
        // Cancel previous completion
        await cancelCompletion(denops, context);

        await new Promise((resolve) =>
          setTimeout(
            resolve,
            options.autoCompleteDelay,
          )
        );

        const changedTick = vars.b.get(denops, "changedtick") as Promise<
          number
        >;
        if (context.changedTick != await changedTick) {
          // Input is changed.  Skip invalid completion.
          return;
        }
      }

      await doCompletion(denops, context, options);
    },
    async onCompleteDone(arg1: unknown, arg2: unknown): Promise<void> {
      const sourceName = arg1 as string;
      const userData = arg2 as DdcUserData;
      const maybe = await contextBuilder.createContext(denops, "CompleteDone");
      if (!maybe) return;
      const [context, options] = maybe;

      await ddc.onCompleteDone(
        denops,
        context,
        options,
        sourceName,
        userData,
      );
    },
  };

  async function checkSkipCompletion(
    event: DdcEvent,
    context: Context,
    options: DdcOptions,
  ): Promise<boolean> {
    // Note: Don't complete when backspace by default, because of completion flicker.
    const prevInput = await vars.g.get(denops, "ddc#_prev_input") as string;
    const checkBackSpace = (!options.backspaceCompletion &&
      context.input != prevInput &&
      context.input.length + 1 == prevInput.length &&
      prevInput.startsWith(context.input));
    if (checkBackSpace && options.completionMode == "popupmenu") {
      await vars.g.set(denops, "ddc#_prev_input", context.input);
      return true;
    }

    // Skip special buffers.
    const buftype = await op.buftype.getLocal(denops);
    if (
      buftype != "" && !options.specialBufferCompletion
    ) {
      return true;
    }

    // Check indentkeys.
    const indentkeys = await op.indentkeys.getLocal(denops);
    for (const pattern of indentkeys.split(",")) {
      const found = pattern.match(/^0?=~?(.+)$/);
      if (!found) {
        continue;
      }

      if (context.input.endsWith(found[1])) {
        // Skip completion and reindent if matched.
        await denops.call("ddc#util#indent_current_line");
        return true;
      }
    }

    if (options.autoCompleteEvents.indexOf(event) < 0) {
      return true;
    }

    return false;
  }

  async function cancelCompletion(
    denops: Denops,
    context: Context,
  ): Promise<void> {
    const pumvisible = await fn.pumvisible(denops);

    await batch(denops, async (denops: Denops) => {
      await vars.g.set(denops, "ddc#_event", context.event);
      await vars.g.set(denops, "ddc#_complete_pos", -1);
      await vars.g.set(denops, "ddc#_candidates", []);
      if (pumvisible) {
        await denops.call("ddc#complete");
      }
    });
  }

  async function doCompletion(
    denops: Denops,
    context: Context,
    options: DdcOptions,
  ): Promise<void> {
    const [completePos, candidates] = await ddc.gatherResults(
      denops,
      context,
      options,
    );

    await (async function write() {
      const pumvisible = await fn.pumvisible(denops);
      const changedTick = vars.b.get(denops, "changedtick") as Promise<number>;
      if (context.changedTick != await changedTick) {
        // Input is changed.  Skip invalid completion.
        return;
      }

      await batch(denops, async (denops: Denops) => {
        await vars.g.set(denops, "ddc#_event", context.event);
        await vars.g.set(denops, "ddc#_prev_input", context.input);
        await vars.g.set(denops, "ddc#_complete_pos", completePos);
        await vars.g.set(denops, "ddc#_candidates", candidates);
        await vars.g.set(
          denops,
          "ddc#_overwrite_completeopt",
          options.overwriteCompleteopt,
        );

        if (
          options.completionMode == "popupmenu" ||
          context.event == "Manual" ||
          context.event == "AutoRefresh" ||
          context.event == "ManualRefresh" ||
          pumvisible
        ) {
          await denops.call("ddc#complete");
        } else if (options.completionMode == "inline") {
          await denops.call("ddc#_inline", options.inlineHighlight);
        } else if (options.completionMode == "manual") {
          // through
        }
      });
    })();
  }

  await batch(denops, async (denops: Denops) => {
    await vars.g.set(denops, "ddc#_candidates", []);
    await vars.g.set(denops, "ddc#_complete_pos", -1);
    await vars.g.set(denops, "ddc#_event", "Manual");
    await vars.g.set(denops, "ddc#_now", 0);
    await vars.g.set(denops, "ddc#_overwrite_completeopt", false);
    await vars.g.set(denops, "ddc#_prev_input", "");
    await vars.g.set(denops, "ddc#_popup_id", -1);

    await denops.cmd("doautocmd <nomodeline> User DDCReady");

    ddc.registerAutocmd(denops, [
      "InsertEnter",
      "InsertLeave",
      "TextChangedI",
      "TextChangedP",
    ]);
  });
}
