import { assertEquals } from "https://deno.land/std@0.98.0/testing/asserts.ts";
import { allWords, splitPages } from "../around.ts";

Deno.test("pages", () => {
  assertEquals(Array.from(splitPages(600, 500)), [[1, 500], [501, 1000]]);
});

Deno.test("allWords", () => {
  assertEquals(allWords(["asdf _w2er", "223r wawer"]), [
    "asdf",
    "_w2er",
    "223r",
    "wawer",
  ]);
});
