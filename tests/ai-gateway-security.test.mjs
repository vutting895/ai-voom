import test from "node:test";
import assert from "node:assert/strict";
import { createModelGateway } from "../src/ai/gateway.js";
import { createOllamaProvider } from "../src/ai/providers/ollama.js";

const envKeys = [
  "VOOM_MODEL_GATEWAY_ENABLED",
  "VOOM_DEFAULT_PROVIDER",
  "VOOM_FALLBACK_PROVIDER",
  "OLLAMA_BASE_URL",
  "OLLAMA_API_KEY",
  "OLLAMA_ALLOWED_HOSTS",
  "OLLAMA_MODEL",
  "OLLAMA_TIMEOUT_MS",
];

function withEnv(values, fn) {
  const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  for (const key of envKeys) {
    if (Object.hasOwn(values, key)) process.env[key] = values[key];
    else delete process.env[key];
  }
  try {
    return fn();
  } finally {
    for (const key of envKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test("model gateway remains disabled unless explicitly enabled", () => {
  withEnv({}, () => assert.equal(createModelGateway(), null));
});

test("Ollama requires HTTPS, an API key, and an exact host allowlist", () => {
  assert.throws(
    () => createOllamaProvider({
      baseUrl: "http://ollama.example.com/v1",
      apiKey: "test-secret",
      allowedHosts: ["ollama.example.com"],
    }),
    /HTTPS/,
  );
  assert.throws(
    () => createOllamaProvider({
      baseUrl: "https://ollama.example.com/v1",
      apiKey: "test-secret",
      allowedHosts: ["other.example.com"],
    }),
    /allowlisted/,
  );
  assert.throws(
    () => createOllamaProvider({
      baseUrl: "https://ollama.example.com/v1",
      apiKey: "",
      allowedHosts: ["ollama.example.com"],
    }),
    /API key/,
  );
  assert.throws(
    () => createOllamaProvider({
      baseUrl: "https://127.0.0.1/v1",
      apiKey: "test-secret",
      allowedHosts: ["127.0.0.1"],
    }),
    /allowlisted/,
  );
});

test("enabled Ollama provider sends auth and refuses redirects", async () => {
  let captured;
  const provider = createOllamaProvider({
    baseUrl: "https://ollama.example.com/v1",
    apiKey: "test-secret",
    allowedHosts: ["ollama.example.com"],
    model: "qwen3:8b",
    fetchImpl: async (url, options) => {
      captured = { url: String(url), options };
      return new Response(JSON.stringify({
        model: "qwen3:8b",
        choices: [{ message: { content: "ok" } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  const result = await provider.chat({
    messages: [{ role: "user", content: "hello" }],
  });

  assert.equal(result.content, "ok");
  assert.equal(captured.options.headers.authorization, "Bearer test-secret");
  assert.equal(captured.options.redirect, "error");
  assert.equal(captured.url, "https://ollama.example.com/v1/chat/completions");
});

test("OpenAI-compatible adapter rejects oversized and malformed requests before fetch", async () => {
  let called = false;
  const provider = createOllamaProvider({
    baseUrl: "https://ollama.example.com/v1",
    apiKey: "test-secret",
    allowedHosts: ["ollama.example.com"],
    fetchImpl: async () => {
      called = true;
      throw new Error("must not be called");
    },
  });

  await assert.rejects(
    provider.chat({ messages: [{ role: "user", content: "x".repeat(12_001) }] }),
    /bounded/,
  );
  await assert.rejects(
    provider.chat({ messages: [{ role: "user", content: "hello" }], maxTokens: 9000 }),
    /maxTokens/,
  );
  assert.equal(called, false);
});

test("gateway supports explicit injected providers for isolated tests", async () => {
  const provider = { chat: async () => ({ provider: "mock", content: "ok" }) };
  const gateway = createModelGateway({
    providers: { mock: provider },
    defaultProvider: "mock",
  });
  assert.deepEqual(
    await gateway.chat({ messages: [{ role: "user", content: "hello" }] }),
    { provider: "mock", content: "ok" },
  );
});
