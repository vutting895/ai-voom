import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { attachResponseAbortSignal } from "../../src/ai/response-abort.js";

test("response close aborts upstream work when the client disconnects", () => {
  const response = new EventEmitter();
  response.writableEnded = false;
  const { signal, dispose } = attachResponseAbortSignal(response);

  response.emit("close");
  assert.equal(signal.aborted, true);
  assert.match(signal.reason.message, /Client disconnected/);
  dispose();
  assert.equal(response.listenerCount("close"), 0);
});

test("normal response completion does not abort upstream work", () => {
  const response = new EventEmitter();
  response.writableEnded = true;
  const { signal, dispose } = attachResponseAbortSignal(response);

  response.emit("close");
  assert.equal(signal.aborted, false);
  dispose();
  assert.equal(response.listenerCount("close"), 0);
});

test("disposing the response listener prevents later abort events", () => {
  const response = new EventEmitter();
  response.writableEnded = false;
  const { signal, dispose } = attachResponseAbortSignal(response);

  dispose();
  response.emit("close");
  assert.equal(signal.aborted, false);
  assert.equal(response.listenerCount("close"), 0);
});
