import type { Callback } from "./types.ts";

import type { Denops } from "@denops/std";
import * as op from "@denops/std/option";

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

// Cache size limit: in practice only a handful of distinct keywordPattern /
// iskeyword combinations appear, so 64 entries is more than enough.
const KEYWORD_CACHE_MAX = 64;
const convertKeywordPatternCache = new Map<string, string>();
const keywordRegExpCache = new Map<string, RegExp>();

export async function convertKeywordPattern(
  denops: Denops,
  keywordPattern: string,
  bufnr?: number,
): Promise<string> {
  const iskeyword = bufnr === undefined
    ? await op.iskeyword.getLocal(denops)
    : await op.iskeyword.getBuffer(denops, bufnr);

  // Neither iskeyword nor keywordPattern contain NUL bytes, so this
  // composite key is unambiguous.
  const cacheKey = keywordPattern + "\0" + iskeyword;
  const cached = convertKeywordPatternCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const keyword = vimoption2ts(iskeyword);
  const replaced = keywordPattern
    .replaceAll("\\k", keyword)
    .replaceAll("[:keyword:]", keyword);

  if (convertKeywordPatternCache.size >= KEYWORD_CACHE_MAX) {
    convertKeywordPatternCache.clear();
  }
  convertKeywordPatternCache.set(cacheKey, replaced);

  return replaced;
}

export function getKeywordRegExp(expandedPattern: string): RegExp {
  const cached = keywordRegExpCache.get(expandedPattern);
  if (cached !== undefined) {
    return cached;
  }

  const re = new RegExp(expandedPattern, "u");

  if (keywordRegExpCache.size >= KEYWORD_CACHE_MAX) {
    keywordRegExpCache.clear();
  }
  keywordRegExpCache.set(expandedPattern, re);

  return re;
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

type KeywordChars = {
  alphabetic: boolean;
  included: Set<number>;
  excluded: Set<number>;
};

function getIskeywordCharCode(charOrCode: string): number {
  if (/^\d+$/.test(charOrCode)) {
    const code = Number.parseInt(charOrCode, 10);

    if (code < 0 || code > 0xff) {
      throw new Error(
        `iskeyword character code must be between 0 and 255: ${charOrCode}`,
      );
    }

    return code;
  }

  const codePoints = [...charOrCode];
  if (codePoints.length !== 1) {
    throw new Error(`Invalid iskeyword character: ${charOrCode}`);
  }

  return codePoints[0].codePointAt(0)!;
}

function parseKeywordChars(option: string): KeywordChars {
  const chars: KeywordChars = {
    alphabetic: false,
    included: new Set<number>(),
    excluded: new Set<number>(),
  };

  const add = (code: number): void => {
    chars.included.add(code);
    chars.excluded.delete(code);
  };

  const remove = (code: number): void => {
    chars.included.delete(code);
    chars.excluded.add(code);
  };

  const applyCode = (code: number, exclusion: boolean): void => {
    if (exclusion) {
      remove(code);
    } else {
      add(code);
    }
  };

  const applyPart = (part: string): void => {
    if (part === "") {
      return;
    }

    // A bare "^" means the literal caret character.
    if (part === "^") {
      add("^".codePointAt(0)!);
      return;
    }

    const exclusion = part.startsWith("^");
    const content = exclusion ? part.substring(1) : part;

    // "@" means alphabetic characters. JavaScript's Unicode property escape
    // is the closest equivalent to Vim's Unicode-aware alphabetic class.
    if (content === "@") {
      chars.alphabetic = !exclusion;
      return;
    }

    // Handle ranges such as "a-z", "48-57", and "@-@".
    if (content.includes("-") && content.length > 1) {
      const [startStr, endStr] = content.split("-", 2);
      const start = getIskeywordCharCode(startStr);
      const end = getIskeywordCharCode(endStr);

      if (start > end) {
        throw new Error(`Invalid iskeyword range: ${content}`);
      }

      for (let code = start; code <= end; code++) {
        applyCode(code, exclusion);
      }
      return;
    }

    applyCode(getIskeywordCharCode(content), exclusion);
  };

  // Split by commas, preserving escaped/special comma forms used by Vim.
  for (const part of option.split(/(?<![\^,]),|(?<!\^),(?!,)/)) {
    applyPart(part);
  }

  return chars;
}

function codeToRegex(code: number): string {
  if (code < 0 || code > 0x10ffff) {
    throw new Error(`Invalid Unicode code point: ${code}`);
  }

  if (code <= 0xff) {
    return "\\x" + code.toString(16).padStart(2, "0");
  }

  return "\\u{" + code.toString(16) + "}";
}

function buildRegexFromCharCodes(charCodes: Set<number>): string {
  if (charCodes.size === 0) {
    return "";
  }

  const sortedCodes = Array.from(charCodes).sort((a, b) => a - b);
  let content = "";

  for (let i = 0; i < sortedCodes.length;) {
    const startCode = sortedCodes[i];
    let j = i;

    while (
      j + 1 < sortedCodes.length &&
      sortedCodes[j + 1] === sortedCodes[j] + 1
    ) {
      j++;
    }

    const endCode = sortedCodes[j];

    if (endCode > startCode) {
      content += `${codeToRegex(startCode)}-${codeToRegex(endCode)}`;
    } else {
      content += codeToRegex(startCode);
    }

    i = j + 1;
  }

  return content;
}

function buildKeywordRegExp(chars: KeywordChars): string {
  const patterns: string[] = [];

  if (chars.alphabetic) {
    const excluded = buildRegexFromCharCodes(chars.excluded);

    patterns.push(
      excluded === ""
        ? "\\p{L}"
        : `(?:(?![${excluded}])\\p{L})`,
    );
  }

  if (chars.included.size > 0) {
    patterns.push(`[${buildRegexFromCharCodes(chars.included)}]`);
  }

  // Match nothing if iskeyword contains no characters.
  if (patterns.length === 0) {
    return "(?!)";
  }

  return patterns.length === 1
    ? patterns[0]
    : `(?:${patterns.join("|")})`;
}

function vimoption2ts(option: string): string {
  if (option === "") {
    return "(?!)";
  }

  return buildKeywordRegExp(parseKeywordChars(option));
}

export async function printError(
  denops: Denops,
  ...messages: unknown[]
) {
  const message = messages.map((v) => {
    if (v instanceof Error) {
      // NOTE: In Deno, Prefer `Error.stack` because it contains
      // `Error.message`.
      return `${v.stack ?? v}`;
    }

    if (typeof v === "object" && v !== null) {
      try {
        const json = JSON.stringify(v);
        return json === undefined ? String(v) : json;
      } catch (_e: unknown) {
        return String(v);
      }
    }

    return String(v);
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
  }

  return await callback(denops, args);
}

const importMapCache = new Map<string, ImportMap | null>();
const importerCache = new Map<string, ImportMapImporter>();

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

  if (importMapCache.has(parentDir)) {
    return importMapCache.get(parentDir) ?? undefined;
  }

  for (const pattern of PATTERNS) {
    const importMapPath = join(parentDir, pattern);

    try {
      const importMap = await loadImportMap(importMapPath);
      importMapCache.set(parentDir, importMap);
      return importMap;
    } catch (err: unknown) {
      if (err instanceof Deno.errors.NotFound) {
        // Ignore NotFound errors and try the next pattern
        continue;
      }

      throw err;
    }
  }

  importMapCache.set(parentDir, null);
  return undefined;
}

export async function importPlugin(path: string): Promise<unknown> {
  // Import module with fragment so that reload works properly
  // https://github.com/vim-denops/denops.vim/issues/227
  const suffix = performance.now();
  const url = toFileUrl(path).href;
  const importMap = await tryLoadImportMap(path);

  if (importMap) {
    const parentDir = dirname(path);
    let importer = importerCache.get(parentDir);

    if (!importer) {
      importer = new ImportMapImporter(importMap);
      importerCache.set(parentDir, importer);
    }

    return await importer.import(`${url}#${suffix}`);
  }

  return await import(`${url}#${suffix}`);
}

Deno.test("vimoption2ts", () => {
  const ascii = new RegExp(vimoption2ts("@,48-57,_"), "u");

  assertEquals(ascii.test("a"), true);
  assertEquals(ascii.test("Z"), true);
  assertEquals(ascii.test("9"), true);
  assertEquals(ascii.test("_"), true);
  assertEquals(ascii.test("-"), false);

  const unicode = new RegExp(vimoption2ts("@"), "u");

  assertEquals(unicode.test("日本語"), true);
  assertEquals(unicode.test("é"), true);
  assertEquals(unicode.test("Ж"), true);
  assertEquals(unicode.test("1"), false);

  const excluded = new RegExp(vimoption2ts("@,^a-z"), "u");

  assertEquals(excluded.test("A"), true);
  assertEquals(excluded.test("Z"), true);
  assertEquals(excluded.test("a"), false);
  assertEquals(excluded.test("z"), false);

  const explicitUnicode = new RegExp(vimoption2ts("あ"), "u");

  assertEquals(explicitUnicode.test("あ"), true);
  assertEquals(explicitUnicode.test("い"), false);

  const digits = new RegExp(vimoption2ts("48-57"), "u");

  assertEquals(digits.test("5"), true);
  assertEquals(digits.test("a"), false);
});
