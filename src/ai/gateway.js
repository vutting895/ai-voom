import { createOllamaProvider } from "./providers/ollama.js";
import { ModelRouter } from "./model-router.js";

export function createModelGateway({
  providers,
  defaultProvider,
  fallbackProvider,
} = {}) {
  // The gateway is an optional non-streaming adapter. It must not silently
  // replace the active Gemini streaming/tool runtime.
  if (!providers && process.env.VOOM_MODEL_GATEWAY_ENABLED !== "true") {
    return null;
  }

  const configured = providers || {
    ollama: createOllamaProvider(),
  };
  const availableProviders = Object.keys(configured);
  const selectedDefault = defaultProvider
    || process.env.VOOM_DEFAULT_PROVIDER
    || availableProviders[0];

  if (!selectedDefault) {
    throw new Error("No model gateway provider is configured");
  }

  return new ModelRouter({
    providers: configured,
    defaultProvider: selectedDefault,
    fallbackProvider: fallbackProvider || process.env.VOOM_FALLBACK_PROVIDER || null,
  });
}
