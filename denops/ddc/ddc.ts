import {
  assertEquals,
  autocmd,
  batch,
  type Denops,
  equal,
  fn,
  op,
  vars,
} from "./deps.ts";
import type {
  BaseUi,
  BaseUiParams,
  CallbackContext,
  Context,
  DdcEvent,
  DdcItem,
  DdcOptions,
  Item,
  OnCallback,
  SourceName,
  UiOptions,
  UserSource,
} from "./types.ts";
import { defaultDummy } from "./context.ts";
import type { Loader } from "./loader.ts";
import { defaultUiOptions } from "./base/ui.ts";
import { defaultSourceOptions } from "./base/source.ts";
import {
  callFilterFilter,
  callSourceGather,
  callSourceGetCompletePosition,
  filterItems,
  getFilter,
  getSource,
  getUi,
} from "./ext.ts";

type DdcResult = {
  items: Item[];
  completePos: number;
  completeStr: string;
  prevInput: string;
  lineNr: number;
  isIncomplete: boolean;
};

export class Ddc {
  currentUi: BaseUi<BaseUiParams> | undefined = undefined;
  currentUiOptions: UiOptions = defaultUiOptions();
  currentUiParams: BaseUiParams = defaultDummy();
  visibleUi = false;

  #loader: Loader;
  #prevResults: Record<SourceName, DdcResult> = {};
  #events: DdcEvent[] = [];
  #prevInput = "";
  #prevSources: UserSource[] = [];
  #prevUi = "";
  #prevEvent = "";

  constructor(loader: Loader) {
    this.#loader = loader;
  }

  initialize(denops: Denops) {
    batch(denops, async (denops: Denops) => {
      await vars.g.set(denops, "ddc#_changedtick", 0);
      await vars.g.set(denops, "ddc#_complete_pos", -1);
      await vars.g.set(denops, "ddc#_items", []);
      await vars.g.set(denops, "ddc#_sources", []);

      await denops.call("ddc#on_event", "Initialize");

      this.registerAutocmd(denops, [
        "BufEnter",
        "BufLeave",
        "FileType",
        "InsertLeave",
        "TextChangedI",
        "TextChangedP",
      ]);
      await denops.cmd(
        "autocmd ddc ModeChanged [vV\x16sn]:i call ddc#on_event('InsertEnter')",
      );
      await denops.cmd(
        "autocmd ddc CmdlineChanged * " +
          ": if getcmdtype() ==# '=' || getcmdtype() ==# '@'" +
          "|   call ddc#on_event('CmdlineChanged')" +
          "| endif",
      );
    });
  }

  async registerAutocmd(denops: Denops, events: DdcEvent[]) {
    await autocmd.group(denops, "ddc", (helper: autocmd.GroupHelper) => {
      for (const event of events) {
        if (!this.#events.includes(event)) {
          helper.define(
            event as autocmd.AutocmdEvent,
            "*",
            `call ddc#on_event("${event}")`,
          );
          this.#events.push(event);
        }
      }
    });
  }

  async gatherResults(
    denops: Denops,
    context: Context,
    onCallback: OnCallback,
    options: DdcOptions,
  ): Promise<[number, DdcItem[]]> {
    this.#prevSources = options.sources;

    const rs = await Promise.all(options.sources.map(async (userSource) => {
      const [s, o, p] = await getSource(
        denops,
        this.#loader,
        options,
        userSource,
      );
      // Check enabled
      if (
        !s || (o.enabledIf !== "" && !(await denops.call("eval", o.enabledIf)))
      ) {
        return;
      }

      const pos = await callSourceGetCompletePosition(
        s,
        denops,
        context,
        onCallback,
        this.#loader,
        options,
        o,
        p,
      );

      const forceCompletion = o.forceCompletionPattern.length !== 0 &&
        context.input.search(
            new RegExp("(?:" + o.forceCompletionPattern + ")$"),
          ) !== -1;

      // NOTE: If forceCompletion and not matched getCompletePosition(),
      // Use cursor position instead.
      const completePos = (pos < 0 && forceCompletion)
        ? context.input.length
        : (s.isBytePos && pos >= 0)
        ? byteposToCharpos(context.input, pos)
        : pos;
      const completeStr = context.input.slice(completePos);

      // Check previous result.
      const checkPrevResult = s.name in this.#prevResults
        ? this.#prevResults[s.name]
        : null;

      const invalidCompleteLength = context.event === "Manual"
        ? (completeStr.length < o.minManualCompleteLength ||
          completeStr.length > o.maxManualCompleteLength)
        : (completeStr.length < o.minAutoCompleteLength ||
          completeStr.length > o.maxAutoCompleteLength);

      const triggerForIncomplete = (checkPrevResult?.isIncomplete ?? false) &&
        context.lineNr === checkPrevResult?.lineNr &&
        completePos === checkPrevResult?.completePos && !invalidCompleteLength;

      if (
        completePos < 0 ||
        (!forceCompletion && !triggerForIncomplete && invalidCompleteLength &&
          (context.event !== "Manual" && context.event !== "Update"))
      ) {
        delete this.#prevResults[s.name];
        return;
      }

      const prevInput = context.input.slice(0, completePos);

      if (
        !checkPrevResult || triggerForIncomplete ||
        prevInput !== checkPrevResult.prevInput ||
        !completeStr.startsWith(checkPrevResult.completeStr) ||
        context.lineNr !== checkPrevResult.lineNr ||
        context.event === "Manual" ||
        (o.isVolatile && context.event !== "Update")
      ) {
        // Not matched.
        const replacePattern = new RegExp(o.replaceSourceInputPattern);

        const result = await callSourceGather(
          s,
          denops,
          {
            ...context,
            input: o.replaceSourceInputPattern.length !== 0
              ? context.input.replace(replacePattern, "")
              : context.input,
          },
          onCallback,
          options,
          o,
          p,
          this.#loader,
          completePos,
          o.replaceSourceInputPattern.length !== 0
            ? completeStr.replace(replacePattern, "")
            : completeStr,
          triggerForIncomplete,
        );

        let items: Item[];
        let isIncomplete: boolean;
        if ("isIncomplete" in result) {
          // DdcGatherItems
          items = result.items.concat();
          isIncomplete = result.isIncomplete;
        } else {
          // Item[]
          items = result.concat();
          isIncomplete = false;
        }

        this.#prevResults[s.name] = {
          items,
          completePos,
          completeStr,
          prevInput,
          lineNr: context.lineNr,
          isIncomplete,
        };
      }

      const prevResult = this.#prevResults[s.name];

      // NOTE: Use deepcopy.  Because of filters may break original items.
      const fis = await filterItems(
        denops,
        this.#loader,
        context,
        onCallback,
        options,
        o,
        completeStr,
        structuredClone(prevResult.items),
      );

      const items = fis.map((c) => (
        {
          ...c,
          __sourceName: s.name,
          __dup: o.dup,
          abbr: formatAbbr(c.word, c.abbr),
          kind: c.kind ? c.kind : "",
          info: c.info ? c.info : "",
          menu: formatMenu(o.mark, c.menu),
        }
      ));
      if (!items.length) {
        return;
      }

      return [completePos, items] as const;
    }));

    // Remove invalid source
    const fs = rs.filter(<T>(v?: T): v is T => !!v);
    if (!fs.length) {
      return [-1, []];
    }

    const completePos = Math.min(...fs.map((v) => v[0]));

    // Flatten items
    let items = fs.flatMap(([pos, items]) =>
      items.map((c) => {
        // NOTE: Merge word by completePos
        const word = context.input.substring(completePos, pos) + c.word;

        return {
          ...c,
          word: word,
          abbr: c.word === c.abbr ? word : c.abbr,
        };
      })
    );

    // Post filters
    for (const userFilter of options.postFilters) {
      const [filter, filterOptions, filterParams] = await getFilter(
        denops,
        this.#loader,
        options,
        userFilter,
      );
      if (!filter) {
        continue;
      }

      // @ts-ignore: postFilters does not change items keys
      items = await callFilterFilter(
        filter,
        denops,
        context,
        onCallback,
        options,
        defaultSourceOptions(),
        filterOptions,
        filterParams,
        context.input.slice(completePos),
        items,
      );
    }

    // Remove dup items
    const seen = new Set();
    let retItems: DdcItem[] = [];
    for (const item of items) {
      // Remove emtpy items
      if (item.word === "") {
        continue;
      }

      if (seen.has(item.word)) {
        if (item.__dup === "force") {
          // Force overwrite duplicated words
          retItems = retItems.filter((c) => c.word !== item.word);
        } else if (item.__dup === "ignore") {
          // Ignore duplicated words
          continue;
        } else {
          // Keep duplicated words
        }
      }

      seen.add(item.word);
      retItems.push(item);
    }

    // Convert2byte for Vim
    const completePosBytes = charposToBytepos(context.input, completePos);

    return [completePosBytes, retItems];
  }

  updateItems(
    name: string,
    items: Item[],
  ) {
    const result = name in this.#prevResults ? this.#prevResults[name] : null;
    if (!result) {
      return;
    }

    result.items = items;
    result.isIncomplete = false;
  }

  async cancelCompletion(
    denops: Denops,
    context: Context,
    options: DdcOptions,
  ) {
    await batch(denops, async (denops: Denops) => {
      await vars.g.set(denops, "ddc#_complete_pos", -1);
      await vars.g.set(denops, "ddc#_items", []);
      await this.hide(denops, context, options);
    });
  }

  async checkSkipCompletion(
    denops: Denops,
    context: Context,
    options: DdcOptions,
  ) {
    // NOTE: Don't complete when backspace by default, because of completion
    // flicker.
    const checkBackSpace = !options.backspaceCompletion &&
      context.input !== this.#prevInput &&
      context.input.length + 1 === this.#prevInput.length &&
      this.#prevInput.startsWith(context.input);
    if (checkBackSpace) {
      this.#prevInput = context.input;

      // NOTE: cancelCompletion is needed.
      await this.cancelCompletion(denops, context, options);

      return true;
    }

    // Skip special buffers.
    if (
      await op.buftype.getLocal(denops) !== "" &&
      !options.specialBufferCompletion && context.mode !== "c"
    ) {
      // NOTE: cancelCompletion is needed.
      await this.cancelCompletion(denops, context, options);

      return true;
    }

    // Check autoCompleteEvents
    if (
      (context.event !== "InsertEnter" && context.mode === "n") ||
      (context.event !== "Manual" &&
        options.autoCompleteEvents.indexOf(context.event) < 0)
    ) {
      return true;
    }

    const [ui, uiOptions, uiParams] = await getUi(
      denops,
      this.#loader,
      this,
      context,
      options,
    );
    if (!ui) {
      return true;
    }

    return await ui.skipCompletion({
      denops,
      context,
      options,
      uiOptions,
      uiParams,
    });
  }

  async checkManualCompletion(
    denops: Denops,
    context: Context,
    options: DdcOptions,
    event: string,
  ) {
    // NOTE: Continue manual completion if narrowing words
    const check = options.autoCompleteEvents.indexOf(event) > 0 &&
      this.#prevEvent === "Manual" &&
      context.input.startsWith(this.#prevInput) &&
      context.input.replace(/\S+$/, "") ===
        this.#prevInput.replace(/\S+$/, "") &&
      await this.visible(denops, context, options);

    if (check) {
      // NOTE: Use prevSources/prevUi/prevEvent to update current items
      options.sources = this.#prevSources;
      options.ui = this.#prevUi;

      // Overwrite event if manual completion
      context.event = this.#prevEvent;
    }
  }

  async doCompletion(
    denops: Denops,
    context: Context,
    cbContext: CallbackContext,
    options: DdcOptions,
  ) {
    const [completePos, items] = await this.gatherResults(
      denops,
      context,
      cbContext.createOnCallback(),
      options,
    );

    this.#prevInput = context.input;

    const changedTick = vars.b.get(denops, "changedtick") as Promise<number>;
    const cursor = fn.getcurpos(denops);
    if (
      context.changedTick !== await changedTick ||
      !equal(context.cursor, await cursor)
    ) {
      // Input is changed.  Skip invalid completion.
      return;
    }

    await (async function write(ddc: Ddc) {
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
    })(this);
  }

  async show(
    denops: Denops,
    context: Context,
    options: DdcOptions,
    completePos: number,
    items: DdcItem[],
  ) {
    const skip = await denops.call(
      "ddc#util#check_skip",
      completePos,
    );
    if (skip) {
      return;
    }

    const [ui, uiOptions, uiParams] = await getUi(
      denops,
      this.#loader,
      this,
      context,
      options,
    );
    if (!ui) {
      return;
    }

    await ui.show({
      denops,
      context,
      options,
      completePos,
      items,
      uiOptions,
      uiParams,
    });

    this.#prevUi = options.ui;
    this.#prevEvent = context.event;
    this.visibleUi = true;
  }

  async hide(
    denops: Denops,
    context: Context,
    options: DdcOptions,
  ) {
    const [ui, uiOptions, uiParams] = await getUi(
      denops,
      this.#loader,
      this,
      context,
      options,
    );
    if (!ui) {
      return;
    }

    await ui.hide({
      denops,
      context,
      options,
      uiOptions,
      uiParams,
    });
    this.visibleUi = false;
    this.#prevEvent = "";
  }

  async visible(
    denops: Denops,
    context: Context,
    options: DdcOptions,
  ): Promise<boolean> {
    if (this.visibleUi) {
      return true;
    }

    const [ui, uiOptions, uiParams] = await getUi(
      denops,
      this.#loader,
      this,
      context,
      options,
    );
    if (!ui) {
      return false;
    }

    // Check UI is visible
    // NOTE: UI may be closed by users
    return ui.visible
      ? ui.visible({
        denops,
        context,
        options,
        uiOptions,
        uiParams,
      })
      : true;
  }
}

function formatAbbr(word: string, abbr: string | undefined): string {
  return abbr ? abbr : word;
}

function formatMenu(prefix: string, menu: string | undefined): string {
  menu = menu ?? "";
  return prefix === "" ? menu : menu === "" ? prefix : `${prefix} ${menu}`;
}

function byteposToCharpos(input: string, pos: number): number {
  const bytes = (new TextEncoder()).encode(input);
  return (new TextDecoder()).decode(bytes.slice(0, pos)).length;
}

function charposToBytepos(input: string, pos: number): number {
  return (new TextEncoder()).encode(input.slice(0, pos)).length;
}

Deno.test("byteposToCharpos", () => {
  assertEquals(byteposToCharpos("あ hoge", 4), 2);
});

Deno.test("charposToBytepos", () => {
  assertEquals(charposToBytepos("あ hoge", 2), 4);
});
