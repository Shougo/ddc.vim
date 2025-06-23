import type { Callback } from "./types.ts";

import type { Denops } from "jsr:@denops/std@~7.6.0";
import * as op from "jsr:@denops/std@~7.6.0/option";

import { is } from "jsr:@core/unknownutil@~4.3.0/is";
import { assertEquals } from "jsr:@std/assert@~1.0.2/equals";

export async function convertKeywordPattern(
  denops: Denops,
  keywordPattern: string,
  bufnr?: number,
): Promise<string> {
  const iskeyword = bufnr === undefined
    ? await op.iskeyword.getLocal(denops)
    : await op.iskeyword.getBuffer(denops, bufnr);
  const keyword = vimoption2ts(iskeyword);
  const replaced = keywordPattern
    .replaceAll("\\k", "[" + keyword + "]")
    .replaceAll("[:keyword:]", keyword);
  return replaced;
}

// See https://github.com/vim-denops/denops.vim/issues/358 for details
export function isDenoCacheIssueError(e: unknown): boolean {
  const expects = [
    "Could not find constraint in the list of versions: ", // Deno 1.40?
    "Could not find version of ", // Deno 1.38
  ] as const;
  if (e instanceof TypeError) {
    return expects.some((expect) => e.message.startsWith(expect));
  }
  return false;
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

export async function printError(
  denops: Denops,
  ...messages: unknown[]
) {
  const message = messages.map((v) => {
    if (v instanceof Error) {
      // NOTE: In Deno, Prefer `Error.stack` because it contains `Error.message`.
      return `${v.stack ?? v}`;
    } else if (typeof v === "object") {
      return JSON.stringify(v);
    } else {
      return `${v}`;
    }
  }).join("\n");
  await denops.call("ddc#util#print_error", message);
}

export async function safeStat(path: string): Promise<Deno.FileInfo | null> {
  // NOTE: Deno.stat() may be failed
  try {
    const stat = await Deno.lstat(path);
    if (stat.isSymlink) {
      try {
        const stat = await Deno.stat(path);
        stat.isSymlink = true;
        return stat;
      } catch (_: unknown) {
        // Ignore stat exception
      }
    }
    return stat;
  } catch (_: unknown) {
    // Ignore stat exception
  }
  return null;
}

export async function callCallback(
  denops: Denops | null,
  callback: Callback,
  args: Record<string, unknown>,
): Promise<unknown | null> {
  if (!denops || !callback) {
    return null;
  }

  if (is.String(callback)) {
    if (callback === "") {
      return null;
    }

    return await denops.call(
      "denops#callback#call",
      callback,
      args,
    );
  } else {
    return await callback(denops, args);
  }
}

Deno.test("vimoption2ts", () => {
  assertEquals(vimoption2ts("@,48-57,_,\\"), "a-zA-Z0-9_\\\\");
  assertEquals(vimoption2ts("@,-,48-57,_"), "a-zA-Z0-9_-");
  assertEquals(vimoption2ts("@,,,48-57,_"), "a-zA-Z,0-9_");
  assertEquals(vimoption2ts("@,48-57,_,-,+,\\,!~"), "a-zA-Z0-9_+\\\\!~-");
});
