import { assertEquals, Denops, op } from "./deps.ts";

export async function convertKeywordPattern(
  denops: Denops,
  keywordPattern: string,
  bufnr?: number,
): Promise<string> {
  const iskeyword = bufnr === undefined
    ? await op.iskeyword.getLocal(denops)
    : await op.iskeyword.getBuffer(denops, bufnr);
  return keywordPattern.replaceAll(
    /\\k/g,
    () => "[" + vimoption2ts(iskeyword) + "]",
  );
}

function vimoption2ts(option: string): string {
  let hasDash = false;
  const patterns: string[] = [];
  for (let pattern of option.split(",")) {
    if (pattern.match(/\d+/)) {
      pattern = pattern.replaceAll(/\d+/g, (s: string) => {
        return String.fromCharCode(parseInt(s, 10));
      });
    }

    switch (pattern) {
      case "":
        // ,
        if (patterns.indexOf(",") < 0) {
          patterns.push(",");
        }
        break;
      case "@":
        patterns.push("a-zA-Z");
        break;
      case "\\":
        patterns.push("\\\\");
        break;
      case "-":
        hasDash = true;
        break;
      default:
        patterns.push(pattern);
        break;
    }
  }

  // Dash must be last.
  if (hasDash) {
    patterns.push("-");
  }

  return patterns.join("");
}

export async function errorException(
  denops: Denops,
  e: unknown,
  message: string,
) {
  await denops.call(
    "ddc#util#print_error",
    message,
  );
  if (e instanceof Error) {
    await denops.call(
      "ddc#util#print_error",
      e.message,
    );
    if (e.stack) {
      await denops.call(
        "ddc#util#print_error",
        e.stack,
      );
    }
  } else {
    await denops.call(
      "ddc#util#print_error",
      "unknown error object",
    );
    console.error(e);
  }
}

Deno.test("vimoption2ts", () => {
  assertEquals(vimoption2ts("@,48-57,_,\\"), "a-zA-Z0-9_\\\\");
  assertEquals(vimoption2ts("@,-,48-57,_"), "a-zA-Z0-9_-");
  assertEquals(vimoption2ts("@,,,48-57,_"), "a-zA-Z,0-9_");
  assertEquals(vimoption2ts("@,48-57,_,-,+,\\,!~"), "a-zA-Z0-9_+\\\\!~-");
});
