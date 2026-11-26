# AI Voom — VOOM AI Workspace

This repository is the Vercel deployment target for VOOM AI, migrated from `vutting895/voom-ai-f480ij`.

## Runtime layout
- `public/index.html`: VOOM AI Workspace interface.
- `server.js`: Express API and Vercel Node.js application entry point.
- `src/ai/`: optional model gateway and OpenAI-compatible provider adapters.
- `tests/`: authenticated HTTP, security-boundary, and provider regression tests.
- Supabase Auth verifies the bearer token on all `/api/*` routes except `/api/public-config`, which exposes only the public Supabase URL and publishable key needed by the browser login flow.

## Required Vercel environment variables
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY` (or legacy `SUPABASE_ANON_KEY`)
- `GEMINI_API_KEY`
- `VOOM_ADMIN_TOKEN` (server-only; never expose to browser code)

No secret values are committed. The Supabase publishable key is designed for browser use; server-only credentials must never be returned by `/api/public-config`.

## Optional Ollama gateway configuration
The existing active `/api/chat` route remains Gemini-primary and retains its streaming response and tool execution. The OpenAI-compatible gateway is a separate, non-streaming adapter and is deliberately **not wired into the active chat route** until streaming, tool-call parity, cancellation, and error semantics are implemented and tested.

The gateway is disabled unless `VOOM_MODEL_GATEWAY_ENABLED=true`. Enabling the optional Ollama adapter requires all of:
- `OLLAMA_BASE_URL`: an HTTPS endpoint; localhost, private IP literals, URL credentials, query strings, and fragments are rejected.
- `OLLAMA_API_KEY`: server-side authentication credential.
- `OLLAMA_ALLOWED_HOSTS`: comma-separated exact hostnames; the endpoint hostname must match one entry.
- `OLLAMA_MODEL`: model identifier (defaults to `qwen3:8b`).
- `OLLAMA_TIMEOUT_MS`: request timeout from 1,000 to 120,000 ms.

The browser cannot select a provider or supply an endpoint, hostname allowlist, model URL, or credential. Provider requests have message, output, timeout, and redirect bounds. Do not enable this adapter on Vercel until the remote endpoint and its network policy have been independently reviewed.

## Local development
```bash
bun install --frozen-lockfile
cp .env.example .env
bun run dev
```

## Validation
```bash
bun run build
bun run test
```

## Migration boundaries and known gaps
- Source repository remains unchanged; this migration is developed only on `migration/voom-ai-runtime-20261126`.
- No production database schema/data, Supabase settings, Vercel environment variables, project settings, domains, DNS, or deployment are changed.
- UI sign-in/sign-up uses the existing Supabase Auth project. Email confirmation behavior depends on the project's current Auth settings.
- The repository declares the Vercel `express` framework preset in `vercel.json`; the Vercel dashboard settings remain untouched.
- Chat history and recalled memories remain browser-local; durable tenant memory/RAG is not implemented or claimed by this migration.
- Chat requests are bounded to the latest 16 messages, 3,000 characters per message, 6,000 characters of recalled context, and at most 10 agent steps.
- The optional Python Agents SDK runtime is not enabled in Vercel.
- Voom Guard's rate limiter and security logs remain process-local; they are not distributed, durable production controls.
- Admin-only security controls continue to require the server-side admin credential. It is not exposed to the browser.
- No broker, order-execution, or Live Trading capability is included.
