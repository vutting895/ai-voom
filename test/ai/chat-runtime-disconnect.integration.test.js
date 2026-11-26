import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createGeminiChatRuntime } from "../../src/ai/chat-runtime.js";
import { attachResponseAbortSignal } from "../../src/ai/response-abort.js";

test("client disconnect aborts the Gemini stream consumed by the route", async () => {
  const response = new EventEmitter();
  response.writableEnded = false;
  const { signal, dispose } = attachResponseAbortSignal(response);
  let streamStarted = false;
  let streamAborted = false;

  const runtime = createGeminiChatRuntime({
    googleProvider: () => ({ id: "mock-gemini" }),
    streamTextImpl: ({ abortSignal }) => ({
      fullStream: (async function* () {
        streamStarted = true;
        yield { type: "text-delta", textDelta: "partial" };
        await new Promise((resolve, reject) => {
          if (abortSignal.aborted) {
            streamAborted = true;
            reject(abortSignal.reason);
            return;
          }
          const onAbort = () => {
            streamAborted = true;
            reject(abortSignal.reason);
          };
          abortSignal.addEventListener("abort", onAbort, { once: true });
        });
      })(),
    }),
  });

  const result = runtime.stream({
    messages: [{ role: "user", content: "continue" }],
    abortSignal: signal,
  });
  const iterator = result.fullStream[Symbol.asyncIterator]();

  try {
    const first = await iterator.next();
    assert.equal(first.value.textDelta, "partial");
    assert.equal(streamStarted, true);

    response.emit("close");
    await assert.rejects(iterator.next(), /Client disconnected/);
    assert.equal(streamAborted, true);
  } finally {
    dispose();
    await iterator.return?.();
  }
});
