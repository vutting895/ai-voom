import { createOpenAICompatibleProvider } from "./openai-compatible.js";

const DEFAULT_TIMEOUT_MS = 60_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 120_000;

function parseAllowedHosts(value) {
  if (Array.isArray(value)) return value.map((host) => String(host).trim().toLowerCase()).filter(Boolean);
  return String(value || "").split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);
}

export function createOllamaProvider({
  baseUrl = process.env.OLLAMA_BASE_URL,
  apiKey = process.env.OLLAMA_API_KEY,
  allowedHosts = process.env.OLLAMA_ALLOWED_HOSTS,
  model = process.env.OLLAMA_MODEL || "qwen3:8b",
  timeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
  fetchImpl = fetch,
} = {}) {
  if (!baseUrl || !apiKey) {
    throw new Error("Ollama requires a configured HTTPS endpoint and server-side API key");
  }

  const endpoint = new URL(baseUrl);
  const hosts = parseAllowedHosts(allowedHosts);
  const hostname = endpoint.hostname.toLowerCase();
  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    !hosts.includes(hostname) ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) ||
    hostname.includes(":")
  ) {
    throw new Error("Ollama endpoint must be HTTPS and match an explicitly allowlisted public hostname");
  }

  if (!Number.isInteger(timeoutMs) || timeoutMs < MIN_TIMEOUT_MS || timeoutMs > MAX_TIMEOUT_MS) {
    throw new Error("Ollama timeout must be between 1000 and 120000 milliseconds");
  }

  return createOpenAICompatibleProvider({
    name: "ollama",
    baseUrl: endpoint.toString(),
    apiKey,
    model,
    timeoutMs,
    fetchImpl,
  });
}
