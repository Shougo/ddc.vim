import {
  Candidate,
  Context,
  DdcCandidate,
  DdcOptions,
  FilterOptions,
  SourceOptions,
} from "./types.ts";
import {
  defaultDdcOptions,
  foldMerge,
  mergeFilterOptions,
  mergeFilterParams,
  mergeSourceOptions,
  mergeSourceParams,
} from "./context.ts";
import {
  BaseSource,
  defaultSourceOptions,
  defaultSourceParams,
} from "./base/source.ts";
import {
  BaseFilter,
  defaultFilterOptions,
  defaultFilterParams,
} from "./base/filter.ts";
import { assertEquals, Denops } from "./deps.ts";

function formatAbbr(word: string, abbr: string | undefined): string {
  return abbr ? abbr : word;
}

function formatMenu(prefix: string, menu: string | undefined): string {
  menu = menu ? menu : "";
  return prefix == ""
    ? menu
    : menu == ""
    ? `[${prefix}]`
    : `[${prefix}] ${menu}`;
}

function sourceArgs(
  options: DdcOptions,
  source: BaseSource,
): [SourceOptions, Record<string, unknown>] {
  const o = foldMerge(
    mergeSourceOptions,
    defaultSourceOptions,
    [options.sourceOptions["_"], options.sourceOptions[source.name]],
  );
  const p = foldMerge(mergeSourceParams, defaultSourceParams, [
    source.params(),
    options.sourceParams[source.name],
  ]);
  return [o, p];
}

function filterArgs(
  filterOptions: Record<string, Partial<FilterOptions>>,
  filterParams: Record<string, Partial<Record<string, unknown>>>,
  filter: BaseFilter,
): [FilterOptions, Record<string, unknown>] {
  // TODO: '_'?
  const optionsOf = (filter: BaseFilter) =>
    foldMerge(mergeFilterOptions, defaultFilterOptions, [
      filterOptions[filter.name],
    ]);
  const paramsOf = (filter: BaseFilter) =>
    foldMerge(mergeFilterParams, defaultFilterParams, [
      filter.params(),
      filterParams[filter.name],
    ]);
  return [optionsOf(filter), paramsOf(filter)];
}

// https://github.com/MeirionHughes/web-streams-extensions/blob/master/src/concat.ts
function concatStreams<T>(...streams: ReadableStream<T>[]): ReadableStream<T> {
  if (streams.length == 0) throw Error("must pass at least 1 stream to concat");

  let reader: ReadableStreamDefaultReader<T> | null = null;

  async function flush(controller: ReadableStreamDefaultController<T>) {
    try {
      if (reader == null) {
        if (streams.length == 0 || streams == null) {
          controller.close();
        }
        const shift = streams.shift();
        if (shift != undefined) {
          reader = shift.getReader();
        }
      }

      while (
        controller.desiredSize != null && controller.desiredSize > 0 &&
        reader != null
      ) {
        const next = await reader.read();
        // if the current reader is exhausted...
        if (next.done) {
          reader = null;
        } else {
          controller.enqueue(next.value);
        }
      }
    } catch (err) {
      controller.error(err);
    }
  }

  return new ReadableStream<T>({
    start(controller) {
      return flush(controller);
    },
    pull(controller) {
      return flush(controller);
    },
    cancel() {
      if (reader) {
        reader.releaseLock();
      }
    },
  });
}

export class Ddc {
  private sources: Record<string, BaseSource> = {};
  private filters: Record<string, BaseFilter> = {};

  async registerFilter(path: string, name: string) {
    const mod = await import(path);
    const filter = new mod.Filter();
    filter.name = name;
    this.filters[filter.name] = filter;
  }
  async registerSource(path: string, name: string) {
    const mod = await import(path);
    const source = new mod.Source();
    source.name = name;
    this.sources[source.name] = source;
  }

  async onEvent(
    denops: Denops,
    context: Context,
    options: DdcOptions,
  ): Promise<void> {
    const sources = options.sources.map((name) => this.sources[name])
      .filter((x) => x);

    const foundFilters = (names: string[]) =>
      names.map((name) => this.filters[name]).filter((x) => x);

    for (const source of sources) {
      const [sourceOptions, _] = sourceArgs(options, source);
      const filters = foundFilters(
        sourceOptions.matchers.concat(
          sourceOptions.sorters,
          sourceOptions.converters,
        ),
      );

      for (const filter of filters) {
        const [o, p] = filterArgs(
          options.filterOptions,
          options.filterParams,
          filter,
        );
        await filter.onEvent(denops, context, o, p);
      }
    }
  }

  async gatherResults(
    denops: Denops,
    context: Context,
    options: DdcOptions,
  ): Promise<
    { completePos: number; candidates: ReadableStream<DdcCandidate[]> }
  > {
    const sources = await Promise.all(
      options.sources
        .map((n) => this.sources[n])
        .filter((v) => v)
        .map(async (s) => {
          const [sourceOptions, sourceParams] = sourceArgs(options, s);
          const [completePos, candidates] = await Promise.all([
            s.getCompletePosition(
              denops,
              context,
              sourceOptions,
              sourceParams,
            ),
            s.gatherCandidates(
              denops,
              context,
              sourceOptions,
              sourceParams,
            ),
          ]);
          return {
            completePos,
            candidates: candidates
              .pipeThrough(this.filterCandidates(
                denops,
                context,
                sourceOptions,
                options.filterOptions,
                options.filterParams,
              ))
              .pipeThrough(this.finalizeCandidates(
                s,
                sourceOptions,
              )),
          };
        }),
    );
    const completePos = Math.max(
      ...sources.map(({ completePos }) => completePos),
    );
    const candidates = concatStreams<DdcCandidate[]>(
      ...sources.map(({ candidates }) => candidates),
    );
    return { completePos, candidates };
  }

  private filterCandidates(
    denops: Denops,
    context: Context,
    sourceOptions: SourceOptions,
    filterOptions: Record<string, Partial<FilterOptions>>,
    filterParams: Record<string, Partial<Record<string, unknown>>>,
  ): TransformStream<Candidate[]> {
    const foundFilters = (names: string[]) =>
      names.map((name) => this.filters[name]).filter((x) => x);
    const matchers = foundFilters(sourceOptions.matchers);
    const sorters = foundFilters(sourceOptions.sorters);
    const converters = foundFilters(sourceOptions.converters);

    return new TransformStream({
      async transform(chunk, controller) {
        for (const matcher of matchers) {
          const [o, p] = filterArgs(filterOptions, filterParams, matcher);
          chunk = await matcher.filter(denops, context, o, p, chunk);
        }
        for (const sorter of sorters) {
          const [o, p] = filterArgs(filterOptions, filterParams, sorter);
          chunk = await sorter.filter(denops, context, o, p, chunk);
        }
        // Filter by maxCandidates
        chunk = chunk.slice(0, sourceOptions.maxCandidates);
        for (const converter of converters) {
          const [o, p] = filterArgs(filterOptions, filterParams, converter);
          chunk = await converter.filter(denops, context, o, p, chunk);
        }
        controller.enqueue(chunk);
      },
    });
  }

  private finalizeCandidates(
    source: BaseSource,
    sourceOptions: SourceOptions,
  ): TransformStream<Candidate[], DdcCandidate[]> {
    return new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(chunk.map((c) => ({
          ...c,
          abbr: formatAbbr(c.word, c.abbr),
          source: source.name,
          icase: true,
          equal: true,
          menu: formatMenu(sourceOptions.mark, c.menu),
        })));
      },
    });
  }
}

Deno.test("sourceArgs", () => {
  const userOptions: DdcOptions = {
    ...defaultDdcOptions(),
    sources: ["strength"],
    sourceOptions: {
      "_": {
        mark: "A",
        matchers: ["matcher_head"],
      },
      "strength": {
        mark: "S",
      },
    },
    sourceParams: {
      "_": {
        "by_": "bar",
      },
      "strength": {
        min: 100,
      },
    },
  };
  class S extends BaseSource {
    params() {
      return {
        "min": 0,
        "max": 999,
      };
    }
    gatherCandidates(
      _denops: Denops,
      _context: Context,
      _options: SourceOptions,
      _params: Record<string, unknown>,
    ): Promise<ReadableStream<Candidate[]>> {
      return Promise.resolve(
        new ReadableStream({
          start(controller) {
            controller.enqueue([]);
            controller.close();
          },
        }),
      );
    }
  }
  const source = new S();
  source.name = "strength";
  const [o, p] = sourceArgs(userOptions, source);
  assertEquals(o, {
    ...defaultSourceOptions(),
    mark: "S",
    matchers: ["matcher_head"],
    maxCandidates: 500,
    converters: [],
    sorters: [],
  });
  assertEquals(p.by_, undefined);
  assertEquals(p, {
    ...defaultSourceParams(),
    min: 100,
    max: 999,
  });
});

Deno.test("filterArgs", () => {
  const userOptions: Record<string, FilterOptions> = {
    "/dev/null": {
      placeholder: undefined,
    },
  };
  const userParams: Record<string, Record<string, unknown>> = {
    "/dev/null": {
      min: 100,
    },
  };
  class F extends BaseFilter {
    params() {
      return {
        "min": 0,
        "max": 999,
      };
    }
    filter(
      _denops: Denops,
      _context: Context,
      _options: FilterOptions,
      _params: Record<string, unknown>,
      _candidates: Candidate[],
    ): Promise<Candidate[]> {
      return Promise.resolve([]);
    }
  }
  const filter = new F();
  filter.name = "/dev/null";
  assertEquals(filterArgs(userOptions, userParams, filter), [{
    ...defaultFilterOptions(),
  }, {
    ...defaultFilterParams(),
    min: 100,
    max: 999,
  }]);
});
