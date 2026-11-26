import test from "node:test";
import assert from "node:assert/strict";
import { createOllamaProvider } from "../../src/ai/providers/ollama.js";

const secureEndpoint = {
  baseUrl: "https://ollama.example.com/v1",
  apiKey: "test-secret",
  allowedHosts: ["ollama.example.com"],
};

test("Ollama adapter calls the authenticated OpenAI-compatible chat completions endpoint", async () => {
  let requestedUrl;
  let requestedBody;
  let requestedOptions;
  const provider = createOllamaProvider({
    ...secureEndpoint,
    model: "qwen3:8b",
    fetchImpl: async (url, options) => {
      requestedUrl = String(url);
      requestedBody = JSON.parse(options.body);
      requestedOptions = options;
      return new Response(JSON.stringify({
        model: "qwen3:8b",
        choices: [{ message: { content: "สวัสดี" } }],
        usage: { total_tokens: 5 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  const result = await provider.chat({
    messages: [{ role: "user", content: "สวัสดี" }],
  });

  assert.equal(requestedUrl, "https://ollama.example.com/v1/chat/completions");
  assert.equal(requestedBody.model, "qwen3:8b");
  assert.equal(requestedOptions.headers.authorization, "Bearer test-secret");
  assert.equal(requestedOptions.redirect, "error");
  assert.equal(result.provider, "ollama");
  assert.equal(result.content, "สวัสดี");
});

test("Ollama adapter normalizes upstream HTTP errors", async () => {
  const provider = createOllamaProvider({
    ...secureEndpoint,
    fetchImpl: async () => new Response("not found", { status: 404 }),
  });
  await assert.rejects(
    () => provider.chat({ messages: [{ role: "user", content: "hello" }] }),
    (error) => error.name === "ProviderError" && error.status === 404,
  );
});
