# AI Voom — VOOM AI Workspace

This repository is the Vercel deployment target for VOOM AI, migrated from `vutting895/voom-ai-f480ij`.

## Runtime layout
- `public/index.html`: VOOM AI Workspace interface.
- `server.js`: Express API and Vercel Node.js application entry point.
- `tests/`: authenticated HTTP and security-boundary regression tests.
- Supabase Auth verifies the bearer token on all `/api/*` routes except `/api/public-config`, which exposes only the public Supabase URL and publishable key needed by the browser login flow.

## Required Vercel environment variables
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY` (or legacy `SUPABASE_ANON_KEY`)
- `GEMINI_API_KEY`
- `VOOM_ADMIN_TOKEN` (server-only; never expose to browser code)

No secret values are committed. The Supabase publishable key is designed for browser use; server-only credentials must never be returned by `/api/public-config`.

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
- Chat history in the legacy interface remains browser-session scoped; durable tenant memory is not claimed by this migration.
- The optional Ollama / Python Agents SDK runtime is not enabled in Vercel. A Vercel function cannot assume a local Ollama process exists.
- Admin-only security controls continue to require the server-side admin credential. It is not exposed to the browser.
- No broker, order-execution, or Live Trading capability is included.
