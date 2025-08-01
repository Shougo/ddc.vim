import type { Callback } from "./types.ts";

import {
  type ImportMap,
  ImportMapImporter,
  loadImportMap,
} from "@lambdalisue/import-map-importer";
import { is } from "@core/unknownutil/is";
import { assertEquals } from "@std/assert/equals";
import { toFileUrl } from "@std/path/to-file-url";
import { fromFileUrl } from "@std/path/from-file-url";
import { join } from "@std/path/join";
import { dirname } from "@std/path/dirname";

import type { Denops } from "@denops/std";
import * as op from "@denops/std/option";

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

function parseIskeywordPart(part: string, charCodes: Set<number>): void {
  const getCharCode = (charOrCode: string): number => {
    return /^\d+$/.test(charOrCode)
      ? parseInt(charOrCode, 10)
      : charOrCode.charCodeAt(0);
  };

  // literal "^"
  if (part === "^") {
    charCodes.add("^".charCodeAt(0));
    return;
  }

  // exclusion mark
  const isExclusion = part.startsWith("^");
  const content = isExclusion ? part.substring(1) : part;

  const action = isExclusion
    ? (code: number) => charCodes.delete(code)
    : (code: number) => charCodes.add(code);

  // "@" -> a-zA-Z
  if (content === "@") {
    for (let i = "a".charCodeAt(0); i <= "z".charCodeAt(0); i++) action(i);
    for (let i = "A".charCodeAt(0); i <= "Z".charCodeAt(0); i++) action(i);
    return;
  }

  // "start-end" ranges
  if (content.includes("-") && content.length > 1) {
    const [startStr, endStr] = content.split("-", 2);
    const start = getCharCode(startStr);
    const end = getCharCode(endStr);
    for (let i = start; i <= end; i++) {
      action(i);
    }
    return;
  }

  // single char
  action(getCharCode(content));
}

function buildRegexFromCharCodes(charCodes: Set<number>): string {
  if (charCodes.size === 0) return "";

  const codeToHexString = (code: number): string => {
    return "\\x" + code.toString(16).padStart(2, "0");
  };

  const sortedCodes = Array.from(charCodes).sort((a, b) => a - b);
  let content = "";

  for (let i = 0; i < sortedCodes.length;) {
    const startCode = sortedCodes[i];
    let j = i;
    while (
      j + 1 < sortedCodes.length && sortedCodes[j + 1] === sortedCodes[j] + 1
    ) {
      j++;
    }
    const endCode = sortedCodes[j];

    if (endCode > startCode) {
      // "start-end" format
      content += `${codeToHexString(startCode)}-${codeToHexString(endCode)}`;
    } else {
      // single char
      content += codeToHexString(startCode);
    }
    i = j + 1;
  }

  return content;
}

function vimoption2ts(option: string): string {
  if (option === "") {
    return "";
  }
  const charCodes = new Set<number>();
  // Split by ",", unless it follows a "^" or is surrounded by ","
  for (const part of option.split(/(?<![\^,]),|(?<!\^),(?!,)/)) {
    parseIskeywordPart(part, charCodes);
  }
  return buildRegexFromCharCodes(charCodes);
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

export async function tryLoadImportMap(
  script: string,
): Promise<ImportMap | undefined> {
  if (script.startsWith("http://") || script.startsWith("https://")) {
    // We cannot load import maps for remote scripts
    return undefined;
  }
  const PATTERNS = [
    "deno.json",
    "deno.jsonc",
    "import_map.json",
    "import_map.jsonc",
  ];
  // Convert file URL to path for file operations
  const scriptPath = script.startsWith("file://")
    ? fromFileUrl(new URL(script))
    : script;
  const parentDir = dirname(scriptPath);
  for (const pattern of PATTERNS) {
    const importMapPath = join(parentDir, pattern);
    try {
      return await loadImportMap(importMapPath);
    } catch (err: unknown) {
      if (err instanceof Deno.errors.NotFound) {
        // Ignore NotFound errors and try the next pattern
        continue;
      }
      throw err; // Rethrow other errors
    }
  }
  return undefined;
}

export async function importPlugin(path: string): Promise<unknown> {
  const suffix = performance.now();
  const url = toFileUrl(path).href;
  const importMap = await tryLoadImportMap(path);
  if (importMap) {
    const importer = new ImportMapImporter(importMap);
    return await importer.import(`${url}#${suffix}`);
  } else {
    return await import(`${url}#${suffix}`);
  }
}

Deno.test("vimoption2ts", () => {
  assertEquals(vimoption2ts(""), "");
  assertEquals(
    vimoption2ts("@,48-57,_,\\"),
    "\\x30-\\x39\\x41-\\x5a\\x5c\\x5f\\x61-\\x7a", // "a-zA-Z0-9_\\\\"
  );
  assertEquals(
    vimoption2ts("@,-,48-57,_"),
    "\\x2d\\x30-\\x39\\x41-\\x5a\\x5f\\x61-\\x7a", // "a-zA-Z0-9_-"
  );
  assertEquals(
    vimoption2ts("@,,,48-57,_"),
    "\\x2c\\x30-\\x39\\x41-\\x5a\\x5f\\x61-\\x7a", // "a-zA-Z,0-9_"
  );
  assertEquals(
    vimoption2ts("@,48-57,_,-,+,\\,!,~"),
    "\\x21\\x2b\\x2d\\x30-\\x39\\x41-\\x5a\\x5c\\x5f\\x61-\\x7a\\x7e", // "a-zA-Z0-9_+\\\\!~-"
  );

  // Examples from Vim's help page
  assertEquals(
    vimoption2ts("_,-,128-140,#-43"),
    "\\x23-\\x2b\\x2d\\x5f\\x80-\\x8c", // '#'-'+', '-', '_', 0x80-0x8c
  );
  assertEquals(vimoption2ts("^a-z,#,^"), "\\x23\\x5e"); // '#' , '^'
  assertEquals(vimoption2ts("@,^a-z"), "\\x41-\\x5a"); // 'A'-'Z'
  assertEquals(vimoption2ts("a-z,A-Z,@-@"), "\\x40-\\x5a\\x61-\\x7a"); // '@', 'A'-'Z', 'a'-'z'
  assertEquals(vimoption2ts("48-57,,,_"), "\\x2c\\x30-\\x39\\x5f"); // ',', '0'-'9', '_'
  assertEquals(vimoption2ts(" -~,^,,9"), "\\x09\\x20-\\x2b\\x2d-\\x7e"); // Tab, ' '-'+', '-'-'~'
});
