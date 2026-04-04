import { assertEquals } from "@std/assert/equals";
import { assertRejects } from "@std/assert/rejects";
import { fromFileUrl } from "@std/path/from-file-url";
import { toFileUrl } from "@std/path/to-file-url";
import { join } from "@std/path/join";
import { Loader } from "../loader.ts";

const TEST_DATA_DIR = join(
  fromFileUrl(new URL(import.meta.url)),
  "..",
  "testdata",
);

function fixturePath(name: string): string {
  return join(TEST_DATA_DIR, `${name}.ts`);
}

Deno.test(
  "registerPath: registers a single source path without error",
  async () => {
    const loader = new Loader();
    const path = fixturePath("source_alpha");
    await loader.registerPath("source", path);
  },
);

Deno.test(
  "registerPath: concurrent registration of the same path is idempotent",
  async () => {
    const loader = new Loader();
    const path = fixturePath("source_alpha");

    // Fire 8 concurrent registrations for the same path.
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => loader.registerPath("source", path)),
    );

    // All should resolve (no rejections despite concurrent calls).
    const rejected = results.filter((r) => r.status === "rejected");
    assertEquals(rejected.length, 0, "No registration should fail");
  },
);

Deno.test(
  "registerPath: concurrent registration of different paths succeeds",
  async () => {
    const loader = new Loader();
    const paths = [
      fixturePath("source_alpha"),
      fixturePath("source_beta"),
      fixturePath("source_gamma"),
    ];

    const results = await Promise.allSettled(
      paths.map((p) => loader.registerPath("source", p)),
    );

    const rejected = results.filter((r) => r.status === "rejected");
    assertEquals(
      rejected.length,
      0,
      "All different-path registrations should succeed",
    );
  },
);

Deno.test(
  "registerPath: registering a non-existent path throws",
  async () => {
    const loader = new Loader();
    const badPath = join(TEST_DATA_DIR, "nonexistent.ts");

    await assertRejects(
      () => loader.registerPath("source", badPath),
      Error,
    );
  },
);

Deno.test("registerPaths: registers multiple paths concurrently", async () => {
  const loader = new Loader();
  const paths = [
    fixturePath("source_alpha"),
    fixturePath("source_beta"),
    fixturePath("source_gamma"),
  ];

  // registerPaths should not throw even on success.
  await loader.registerPaths("source", paths);
});

Deno.test(
  "registerPaths: does not throw when some paths are invalid",
  async () => {
    const loader = new Loader();
    const paths = [
      fixturePath("source_alpha"),
      join(TEST_DATA_DIR, "nonexistent.ts"),
      fixturePath("source_beta"),
    ];

    // registerPaths absorbs errors internally and must not throw.
    await loader.registerPaths("source", paths);
  },
);

Deno.test(
  "registerPaths: concurrent calls for the same paths are idempotent",
  async () => {
    const loader = new Loader();
    const paths = [fixturePath("source_alpha"), fixturePath("source_beta")];

    // Two concurrent registerPaths calls with overlapping paths.
    const [r1, r2] = await Promise.allSettled([
      loader.registerPaths("source", paths),
      loader.registerPaths("source", paths),
    ]);

    assertEquals(r1.status, "fulfilled");
    assertEquals(r2.status, "fulfilled");
  },
);

Deno.test(
  "registerPath: re-registration of the same path after initial success is a no-op",
  async () => {
    const loader = new Loader();
    const path = fixturePath("source_alpha");

    await loader.registerPath("source", path);
    // Second call must succeed without error (fast-path check).
    await loader.registerPath("source", path);
  },
);

// Verify that the module URL used in import.meta.url resolves to a real file.
Deno.test("testdata fixtures are accessible", async () => {
  for (const name of ["source_alpha", "source_beta", "source_gamma"]) {
    const p = fixturePath(name);
    const stat = await Deno.stat(p);
    assertEquals(stat.isFile, true, `${name}.ts should be a file`);
  }
});

// Smoke-test: ensure toFileUrl/fromFileUrl round-trips work correctly for
// fixture paths (importPlugin relies on toFileUrl internally).
Deno.test("fixture paths survive toFileUrl/fromFileUrl round-trip", () => {
  const path = fixturePath("source_alpha");
  const url = toFileUrl(path).href;
  const back = fromFileUrl(url);
  assertEquals(back, path);
});
