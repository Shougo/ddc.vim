import { assertEquals, spy } from "./deps.ts";
import { CallbackContext } from "./types.ts";

class DdcCallbackCancelError extends Error {
  constructor(message?: string) {
    super(message);

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DdcCallbackCancelError);
    }
  }
}
Object.defineProperty(DdcCallbackCancelError.prototype, "name", {
  value: "DdcCallbackCancelError",
  configurable: true,
  enumerable: false,
  writable: true,
});

export const isDdcCallbackCancelError = (
  v: unknown,
): v is DdcCallbackCancelError => {
  return typeof v === "object" && v instanceof Error &&
    // deno-lint-ignore no-explicit-any
    (v as any).name === "DdcCallbackCancelError";
};

type PromiseHandler<T> = {
  resolve: (value: T) => void;
  cancel: () => void;
};

export const createCallbackContext = (): CallbackContext => {
  const handlersMap = new Map<string, Set<PromiseHandler<unknown>>>();
  let symbol = Symbol();

  const revoke = () => {
    symbol = Symbol();
    for (const [_id, handlers] of [...handlersMap]) {
      for (const handler of [...handlers]) {
        handler.cancel();
      }
      handlers.clear();
    }
    handlersMap.clear();
  };
  const emit = (id: string, payload?: unknown) => {
    const handlers = handlersMap.get(id);
    if (!handlers) return;
    for (const handler of [...handlers]) {
      handler.resolve(payload);
    }
    handlers.clear();
    handlersMap.delete(id);
  };
  const createOnCallback = () => {
    const currentSymbol = symbol;
    const onCallback = (id: string) => {
      if (currentSymbol !== symbol) {
        return Promise.reject(
          new DdcCallbackCancelError(`Callback for ${id} is cancelled.`),
        );
      }
      const handlers = handlersMap.get(id) ?? new Set();
      handlersMap.set(id, handlers);
      const promise = new Promise((resolveOrig, rejectOrig) => {
        let resolved = false;
        const resolve = (value: unknown) => {
          resolveOrig(value);
          resolved = true;
        };
        const cancel = () => {
          if (resolved) return;
          rejectOrig(
            new DdcCallbackCancelError(`Callback for ${id} is cancelled.`),
          );
        };
        const handler = {
          resolve,
          cancel,
        };
        handlers.add(handler);
      });
      return promise;
    };
    return onCallback;
  };

  return {
    emit,
    revoke,
    createOnCallback,
  };
};

Deno.test("onCallback and emit", async () => {
  const runMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));
  const ok = spy();
  const ng = spy();
  const ctx = createCallbackContext();

  const onCallback = ctx.createOnCallback();
  ctx.emit("1", "too early");
  onCallback("1").then(ok).catch(ng);

  assertEquals(ok.calls.length, 0);

  await runMicrotasks();
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
  assertEquals(ng.calls.length, 0);
});

Deno.test("onCallback and revoke", async () => {
  const runMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));
  const ok1 = spy();
  const ng1 = spy();
  const ok2 = spy();
  const ng2 = spy();
  const ctx = createCallbackContext();

  const onCallback = ctx.createOnCallback();
  onCallback("1").then(ok1).catch(ng1);

  assertEquals(ok1.calls.length, 0);

  ctx.emit("2", "other id");
  await runMicrotasks();
  assertEquals(ok1.calls.length, 0);

  ctx.revoke();
  onCallback("2").then(ok2).catch(ng2);
  await runMicrotasks();

  assertEquals(ng1.calls.length, 1);
  assertEquals(ng1.calls[0].args.length, 1);
  assertEquals(isDdcCallbackCancelError(ng1.calls[0].args[0]), true);

  assertEquals(ng2.calls.length, 1);
  assertEquals(ng2.calls[0].args.length, 1);
  assertEquals(isDdcCallbackCancelError(ng2.calls[0].args[0]), true);
});

Deno.test("multiple onCallback and multiple emit", async () => {
  const runMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));
  const ok1 = spy();
  const ok2 = spy();
  const ok3 = spy();
  const ctx = createCallbackContext();

  ctx.createOnCallback()("1").then(ok1);
  ctx.createOnCallback()("1").then(ok2);

  ctx.emit("1", "payload1");
  ctx.emit("1", "payload2");

  ctx.createOnCallback()("1").then(ok3);

  ctx.emit("1", "payload3");

  ctx.revoke();
  await runMicrotasks();

  assertEquals(ok1.calls.length, 1);
  assertEquals(ok2.calls.length, 1);
  assertEquals(ok3.calls.length, 1);

  assertEquals(ok1.calls[0].args, ["payload1"]);
  assertEquals(ok2.calls[0].args, ["payload1"]);
  assertEquals(ok3.calls[0].args, ["payload3"]);
});
