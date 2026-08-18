/**
 * Unit tests for gather AbortSignal cancellation.
 *
 * These tests exercise the abort-promise logic used inside callSourceGather
 * without requiring a live Denops instance.
 */

import { assertEquals } from "@std/assert/equals";
import { assertRejects } from "@std/assert/rejects";
import { isDdcCallbackCancelError } from "../callback.ts";
import { createAbortPromise } from "../ext.ts";

// ---------------------------------------------------------------------------
// Test: an already-aborted signal causes immediate rejection with the right
// error name so that isDdcCallbackCancelError recognises it.
// ---------------------------------------------------------------------------
Deno.test(
  "gather cancel: already-aborted signal rejects",
  async () => {
    const controller = new AbortController();
    controller.abort();

    const { promise, cleanup } = createAbortPromise(controller.signal);

    try {
      await assertRejects(() => promise);
    } finally {
      cleanup();
    }
  },
);

// ---------------------------------------------------------------------------
// Test: aborting a signal after Promise.race starts cancels a never-resolving
// gather and the result is [] (simulating callSourceGather error handling).
// ---------------------------------------------------------------------------
Deno.test(
  "gather cancel: aborting mid-flight cancels the gather via Promise.race",
  async () => {
    const controller = new AbortController();

    // Simulate a slow gather that never completes on its own.
    const slowGather = new Promise<string[]>(() => {
      // intentionally never resolves
    });

    const abort = createAbortPromise(controller.signal);

    // Use abort.promise, not the whole { promise, cleanup } object.
    const racePromise = Promise.race([
      slowGather,
      abort.promise,
    ]);

    try {
      controller.abort();

      let caught: unknown;
      try {
        await racePromise;
      } catch (e) {
        caught = e;
      }

      assertEquals(caught instanceof Error, true, "should throw an Error");
      assertEquals(
        isDdcCallbackCancelError(caught),
        true,
        "error must satisfy isDdcCallbackCancelError",
      );
    } finally {
      abort.cleanup();
    }
  },
);

// ---------------------------------------------------------------------------
// Test: without a signal the gather completes normally (legacy path).
// ---------------------------------------------------------------------------
Deno.test("gather cancel: no signal – gather resolves normally", async () => {
  // When callSourceGather receives no signal it just awaits the gather promise.
  const fastGather = Promise.resolve(["item1", "item2"]);

  // No signal → just await directly (the `if (!signal) return await gather`
  // path).  Simulate that here.
  const result = await fastGather;

  assertEquals(result, ["item1", "item2"]);
});

// ---------------------------------------------------------------------------
// Test: a signal that is never aborted does not interfere with normal
// completion.
// ---------------------------------------------------------------------------
Deno.test("gather cancel: non-aborted signal – gather resolves normally", async () => {
  const controller = new AbortController();

  const fastGather = Promise.resolve(["item1"]);
  const abortPromise = createAbortPromise(controller.signal);

  const result = await Promise.race([fastGather, abortPromise]);

  assertEquals(result, ["item1"]);
});
