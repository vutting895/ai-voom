import test from "node:test";
import assert from "node:assert/strict";
import { streamText, tool } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { z } from "zod";
import { bindToolAbortSignal } from "../../src/ai/tool-abort.js";

test("AI SDK streamText forwards request cancellation to tool execution", async () => {
  const requestController = new AbortController();
  const fallbackController = new AbortController();
  let receivedSignal;
  let markStarted;
  const toolStarted = new Promise((resolve) => {
    markStarted = resolve;
  });

  const probeTool = tool({
    description: "Wait for request cancellation",
    inputSchema: z.object({ value: z.string() }),
    execute: async ({ value }, options = {}) => {
      receivedSignal = options.abortSignal;
      markStarted();
      await new Promise((resolve, reject) => {
        const signal = options.abortSignal;
        if (!signal) {
          reject(new Error("AI SDK did not provide a tool AbortSignal"));
          return;
        }
        if (signal.aborted) {
          reject(signal.reason ?? new Error("aborted"));
          return;
        }
        signal.addEventListener(
          "abort",
          () => reject(signal.reason ?? new Error("aborted")),
          { once: true },
        );
      });
      return { value };
    },
  });

  // A distinct fallback proves that streamText itself supplies the request signal.
  bindToolAbortSignal(probeTool, fallbackController.signal);

  const model = new MockLanguageModelV3({
    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "stream-start", warnings: [] });
          controller.enqueue({
            type: "tool-call",
            toolCallId: "call-cancel-1",
            toolName: "probe",
            input: JSON.stringify({ value: "test" }),
          });
          controller.enqueue({
            type: "finish",
            finishReason: { unified: "tool-calls", raw: undefined },
            usage: {
              inputTokens: {
                total: 1,
                noCache: 1,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: {
                total: 1,
                text: 1,
                reasoning: undefined,
              },
            },
          });
          controller.close();
        },
      }),
    }),
  });

  const result = streamText({
    model,
    messages: [{ role: "user", content: "Run the probe tool." }],
    tools: { probe: probeTool },
    abortSignal: requestController.signal,
    stopWhen: ({ steps }) => steps.length >= 1,
  });

  const consumeStream = (async () => {
    for await (const _chunk of result.fullStream) {
      // Consume the real SDK stream until the tool observes cancellation.
    }
  })();

  await toolStarted;
  assert.ok(receivedSignal, "tool execution should receive an AbortSignal");
  assert.notEqual(receivedSignal, fallbackController.signal);
  requestController.abort(new Error("client disconnected"));

  await consumeStream;
  assert.equal(receivedSignal.aborted, true);
  assert.equal(fallbackController.signal.aborted, false);
});
