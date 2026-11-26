import test from "node:test";
import assert from "node:assert/strict";
import { createGeminiChatRuntime } from "../../src/ai/chat-runtime.js";

test("Gemini runtime preserves streaming model, search grounding, and tool configuration", () => {
  const model = { id: "gemini-mock" };
  const tools = { calculate_math: { execute: async () => 2 } };
  const messages = [{ role: "user", content: "2+2" }];
  const streamResult = { fullStream: (async function* () {})() };
  let modelCall;
  let streamCall;

  const runtime = createGeminiChatRuntime({
    googleProvider: (modelId, options) => {
      modelCall = { modelId, options };
      return model;
    },
    streamTextImpl: (options) => {
      streamCall = options;
      return streamResult;
    },
  });

  const result = runtime.stream({
    searchEnabled: true,
    temperature: 0.4,
    maxSteps: 4,
    system: "system prompt",
    messages,
    tools,
  });

  assert.equal(result, streamResult);
  assert.deepEqual(modelCall, {
    modelId: "gemini-3.6-flash",
    options: { useSearchGrounding: true },
  });
  assert.equal(streamCall.model, model);
  assert.equal(streamCall.temperature, 0.4);
  assert.equal(streamCall.maxSteps, 4);
  assert.equal(streamCall.system, "system prompt");
  assert.equal(streamCall.messages, messages);
  assert.equal(streamCall.tools, tools);
});

test("Gemini runtime keeps search grounding disabled by default", () => {
  let options;
  const runtime = createGeminiChatRuntime({
    googleProvider: (_modelId, providerOptions) => {
      options = providerOptions;
      return {};
    },
    streamTextImpl: (input) => input,
  });

  runtime.stream({ messages: [{ role: "user", content: "hello" }] });
  assert.deepEqual(options, { useSearchGrounding: false });
});

test("Gemini runtime rejects invalid controls before provider invocation", () => {
  let called = false;
  const runtime = createGeminiChatRuntime({
    googleProvider: () => {
      called = true;
      return {};
    },
    streamTextImpl: () => ({}),
  });

  assert.throws(
    () => runtime.stream({ messages: [], temperature: 0.7, maxSteps: 3 }),
    /non-empty/,
  );
  assert.throws(
    () => runtime.stream({ messages: [{ role: "user", content: "x" }], temperature: 2 }),
    /temperature/,
  );
  assert.throws(
    () => runtime.stream({ messages: [{ role: "user", content: "x" }], maxSteps: 11 }),
    /maxSteps/,
  );
  assert.equal(called, false);
});
