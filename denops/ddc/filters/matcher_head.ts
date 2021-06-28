import { BaseFilter } from "../base/filter.ts";
import { Candidate, Context } from "../types.ts";
import { Denops } from "../deps.ts";
import { assertEquals } from "https://deno.land/std@0.98.0/testing/asserts.ts";

function lastWord(input: string): string {
  const match = input.match(/\w*$/);
  return match ? match[0] : "";
}

export class Filter extends BaseFilter {
  filter(_denops: Denops, context: Context): Promise<Candidate[]> {
    const completeStr = lastWord(context.input);
    const candidates = context.candidates.filter(
      (candidate) => candidate.word.startsWith(completeStr),
    );
    return Promise.resolve(candidates);
  }
}

Deno.test("lastWord", () => {
  assertEquals(lastWord(""), "");
  assertEquals(lastWord("a"), "a");
  assertEquals(lastWord("foo bar"), "bar");
  assertEquals(lastWord("foo barあ"), "");
  assertEquals(lastWord("foo barあhoge"), "hoge");
  assertEquals(lastWord("あ_1A"), "_1A");
  assertEquals(lastWord("あ1A_"), "1A_");
  assertEquals(lastWord("あA_1"), "A_1");
});
