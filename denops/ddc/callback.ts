import type { Spy } from "./deps.ts";
import { assertEquals, FakeTime, spy } from "./deps.ts";
import { CallbackContext } from "./types.ts";

export class CallbackTimeoutError extends Error {
  constructor(message?: string) {
    super(message);

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CallbackTimeoutError);
    }
  }
}
Object.defineProperty(CallbackTimeoutError.prototype, "name", {
  value: "CallbackTimeoutError",
  configurable: true,
  enumerable: false,
  writable: true,
});

export const createCallbackContext = (): CallbackContext => {
  const resolversMap = new Map<string, Set<(value: unknown) => void>>();

  const emit = (id: string, payload?: unknown) => {
    const resolvers = resolversMap.get(id);
    if (!resolvers) return;
    for (const resolver of [...resolvers]) {
      resolver(payload);
    }
    resolvers.clear();
    resolversMap.delete(id);
  };
  const once = (id: string, timeout: number) => {
    const resolvers = resolversMap.get(id) ?? new Set();
    resolversMap.set(id, resolvers);
    const promise = new Promise((resolveIn, rejectIn) => {
      let resolved = false as boolean;
      const resolve = (value: unknown) => {
        resolveIn(value);
        resolved = true;
      };
      resolvers.add(resolve);
      setTimeout(() => {
        if (resolved) return;
        resolvers.delete(resolve);
        if (resolvers.size === 0) resolversMap.delete(id);
        rejectIn(new CallbackTimeoutError(`Timeout ${timeout}ms exceeded.`));
      }, timeout);
    });
    return promise;
  };

  return {
    emit,
    once,
  };
};

Deno.test("once and emit", async () => {
  const nativeSetTimeout = setTimeout;
  const runMicrotasks = () => {
    return new Promise((resolve) => nativeSetTimeout(resolve, 0));
  };
  const time: FakeTime = new FakeTime();

  try {
    await main();
  } finally {
    time.restore();
  }

  async function main() {
    const ok: Spy<void> = spy();
    const ng: Spy<void> = spy();
    const ctx = createCallbackContext();

    ctx.emit("1", "too early");
    ctx.once("1", 2000).then(ok).catch(ng);

    assertEquals(ok.calls.length, 0);

    time.tick(500);
    assertEquals(ok.calls.length, 0);

    ctx.emit("1", "payload1");
    ctx.emit("1", "payload2");
    assertEquals(ok.calls.length, 0);

    await runMicrotasks();
    assertEquals(ok.calls.length, 1);
    assertEquals(ok.calls[0].args, ["payload1"]);

    ctx.emit("1", "payload3");
    await runMicrotasks();
    assertEquals(ok.calls.length, 1);

    time.tick(2000);
    assertEquals(ng.calls.length, 0);
  }
});

Deno.test("once and timeout", async () => {
  const nativeSetTimeout = setTimeout;
  const runMicrotasks = () => {
    return new Promise((resolve) => nativeSetTimeout(resolve, 0));
  };
  const time: FakeTime = new FakeTime();

  try {
    await main();
  } finally {
    time.restore();
  }

  async function main() {
    const ok: Spy<void> = spy();
    const ng: Spy<void> = spy();
    const ctx = createCallbackContext();
    ctx.once("1", 2000).then(ok).catch(ng);

    assertEquals(ok.calls.length, 0);

    ctx.emit("2", "payload1");
    await runMicrotasks();
    assertEquals(ok.calls.length, 0);

    time.tick(2000);
    await runMicrotasks();
    assertEquals(ng.calls.length, 1);
    assertEquals(ng.calls[0].args.length, 1);
    assertEquals(ng.calls[0].args[0] instanceof CallbackTimeoutError, true);
  }
});

Deno.test("many once and many emit", async () => {
  const nativeSetTimeout = setTimeout;
  const runMicrotasks = () => {
    return new Promise((resolve) => nativeSetTimeout(resolve, 0));
  };
  const time: FakeTime = new FakeTime();

  try {
    await main();
  } finally {
    time.restore();
  }

  async function main() {
    const ok1: Spy<void> = spy();
    const ok2: Spy<void> = spy();
    const ok3: Spy<void> = spy();
    const ctx = createCallbackContext();

    ctx.once("1", 2000).then(ok1);
    ctx.once("1", 2000).then(ok2);

    ctx.emit("1", "payload1");
    ctx.emit("1", "payload2");

    ctx.once("1", 2000).then(ok3);

    ctx.emit("1", "payload3");

    await runMicrotasks();

    assertEquals(ok1.calls.length, 1);
    assertEquals(ok2.calls.length, 1);

    assertEquals(ok1.calls[0].args, ["payload1"]);
    assertEquals(ok2.calls[0].args, ["payload1"]);
    assertEquals(ok3.calls[0].args, ["payload3"]);
  }
});
