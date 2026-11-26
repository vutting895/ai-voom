const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;
const MAX_MESSAGES = 32;
const MAX_MESSAGE_CHARS = 12_000;

export class ProviderError extends Error {
  constructor(message, { provider, status, cause, retryable } = {}) {
    super(message, { cause });
    this.name = "ProviderError";
    this.provider = provider;
    this.status = status;
    this.retryable = retryable ?? (
      status == null || status === 408 || status === 429 || status >= 500
    );
  }
}

export function createOpenAICompatibleProvider({
  name,
  baseUrl,
  apiKey,
  model,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = fetch,
}) {
  if (!name || !baseUrl || !model) {
    throw new Error("Provider name, baseUrl and model are required");
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new Error("Provider timeout must be between 1000 and 120000 milliseconds");
  }

  const endpoint = new URL("chat/completions", baseUrl.endsWith("/") ? baseUrl : baseUrl + "/");

  return {
    name,
    model,
    async chat({ messages, temperature = 0.2, maxTokens = 1024 }) {
      if (
        !Array.isArray(messages) ||
        messages.length === 0 ||
        messages.length > MAX_MESSAGES ||
        messages.some((message) =>
          !message ||
          typeof message !== "object" ||
          typeof message.role !== "string" ||
          typeof message.content !== "string" ||
          message.content.length > MAX_MESSAGE_CHARS
        )
      ) {
        throw new TypeError("messages must contain 1 to 32 bounded role/content entries");
      }
      if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
        throw new TypeError("temperature must be between 0 and 2");
      }
      if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 8192) {
        throw new TypeError("maxTokens must be an integer between 1 and 8192");
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(endpoint, {
          method: "POST",
          redirect: "error",
          headers: {
            "content-type": "application/json",
            ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({
            model,
            messages,
            temperature,
            max_tokens: maxTokens,
            stream: false,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new ProviderError(`${name} returned HTTP ${response.status}`, {
            provider: name,
            status: response.status,
          });
        }

        const payload = await response.json();
        const content = payload?.choices?.[0]?.message?.content;
        if (typeof content !== "string" || content.length > 100_000) {
          throw new ProviderError(`${name} returned an invalid chat completion`, {
            provider: name,
            retryable: false,
          });
        }

        return {
          provider: name,
          model: payload.model || model,
          content,
          usage: payload.usage ?? null,
        };
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        throw new ProviderError(`${name} request failed`, {
          provider: name,
          cause: error,
        });
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
