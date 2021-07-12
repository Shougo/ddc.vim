import { BaseFilter, Candidate, Context, FilterOptions } from "../types.ts";
import { Denops } from "../deps.ts";
import { assertEquals } from "https://deno.land/std@0.98.0/testing/asserts.ts";

function lastWord(input: string): string {
  const match = input.match(/\w*$/);
  return match ? match[0] : "";
}

export class Filter extends BaseFilter {
  filter(
    _denops: Denops,
    context: Context,
    _options: FilterOptions,
    _params: Record<string, unknown>,
    candidates: Candidate[],
  ): Promise<Candidate[]> {
    const completeStr = lastWord(context.input);
    const filtered = candidates.filter(
      (candidate) => candidate.word.startsWith(completeStr),
    );
    return Promise.resolve(filtered);
  }

  params(): Record<string, unknown> {
    return {};
  }
}

Deno.test("lastWord", () => {
  assertEquals(lastWord(""), "");
  assertEquals(lastWord("a"), "a");
  assertEquals(lastWord("foo bar"), "bar");
  assertEquals(lastWord("foo bar?"), "");
  assertEquals(lastWord("foo bar!hoge"), "hoge");
  assertEquals(lastWord("~_1A"), "_1A");
  assertEquals(lastWord("!1A_"), "1A_");
  assertEquals(lastWord("'A_1"), "A_1");
});
