import test from "node:test";
import assert from "node:assert/strict";
import { bindToolAbortSignal } from "../../src/ai/tool-abort.js";

test("tool execution receives the request AbortSignal", async () => {
  const controller = new AbortController();
  let received;
  const definition = { execute: async (_input, options) => { received = options.abortSignal; return { ok: true }; } };
  bindToolAbortSignal(definition, controller.signal);
  assert.deepEqual(await definition.execute({}), { ok: true });
  assert.equal(received, controller.signal);
});

test("tool execution is rejected when the request was already aborted", async () => {
  const controller = new AbortController();
  controller.abort(new Error("Client disconnected"));
  let invoked = false;
  const definition = { execute: async () => { invoked = true; } };
  bindToolAbortSignal(definition, controller.signal);
  await assert.rejects(definition.execute({}), /Client disconnected/);
  assert.equal(invoked, false);
});

test("tool execution preserves implementation errors", async () => {
  const controller = new AbortController();
  const failure = new Error("upstream failed");
  const definition = { execute: async () => { throw failure; } };
  bindToolAbortSignal(definition, controller.signal);
  await assert.rejects(definition.execute({}), error => error === failure);
});
