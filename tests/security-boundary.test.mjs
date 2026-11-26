import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");

test("API authentication uses verified Supabase user identity and fails closed", () => {
  assert.match(server, /SUPABASE_URL/);
  assert.match(server, /SUPABASE_PUBLISHABLE_KEY/);
  assert.match(server, /authClient\.auth\.getUser\(accessToken\)/);
  assert.match(server, /SUPABASE_AUTH_NOT_CONFIGURED/);
  assert.ok(server.includes("req.user = Object.freeze({ id: identity.userId });"));
  assert.ok(server.indexOf("app.use('/api',") < server.indexOf("app.use(express.json({ limit: '64kb' }))"), "authenticate before parsing the body");
});

test("security administration requires a separate admin token", () => {
  assert.match(server, /VOOM_ADMIN_TOKEN/);
  assert.match(server, /x-voom-admin-token/);
  assert.match(server, /ADMIN_AUTH_NOT_CONFIGURED/);
});

test("JSON request size is bounded and caller-controlled proxy headers are ignored", () => {
  assert.match(server, /express\.json\(\{ limit: '64kb' \}\)/);
  assert.match(server, /req\.socket\?\.remoteAddress/);
  assert.doesNotMatch(server, /forwarded\.split\(','\)/);
});

test("arbitrary custom URL fetch is not exposed as an AI tool", () => {
  assert.doesNotMatch(server, /customApiUrl|customUrl/);
  assert.match(server, /z\.enum\(\['crypto', 'joke', 'weather'\]\)/);
});

test("authenticated identity endpoint is mounted behind the Supabase API guard", () => {
  const guard = server.indexOf("app.use('/api',");
  const route = server.indexOf("app.get('/api/auth/me'");
  assert.ok(guard >= 0 && route > guard);
  assert.match(server, /userId: req\.user\.id/);
});

test("public config bootstrap exposes only browser-safe Supabase configuration", () => {
  const route = server.match(/app\.get\('\/api\/public-config'[\s\S]*?\n\}\);/);
  assert.ok(route, "public config route exists");
  assert.match(route[0], /supabaseUrl:\s*SUPABASE_URL/);
  assert.match(route[0], /publishableKey:\s*SUPABASE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(route[0], /GEMINI_API_KEY|VOOM_ADMIN_TOKEN|SERVICE_ROLE|DATABASE_URL/i);
  assert.ok(server.indexOf("app.get('/api/public-config'") < server.indexOf("app.use('/api', createApiAuthMiddleware"));
});

test("chat API applies bounded schemas before invoking a model", () => {
  assert.match(server, /const chatRequestSchema = z\.object/);
  assert.match(server, /\.max\(16\)/);
  assert.match(server, /content: z\.string\(\)\.min\(1\)\.max\(3000\)/);
  assert.match(server, /maxSteps: z\.number\(\)\.int\(\)\.min\(1\)\.max\(10\)/);
  assert.match(server, /chatRequestSchema\.safeParse\(req\.body\)/);
  assert.ok(server.indexOf("chatRequestSchema.safeParse(req.body)") < server.indexOf("app.post('/api/chat'") + 120);
});

test("provider errors are not reflected to API clients", () => {
  assert.match(server, /error: 'AI_PROVIDER_ERROR'/);
  assert.match(server, /error: 'AI_PROVIDER_UNAVAILABLE'/);
  assert.doesNotMatch(server, /res\.write\([^\n]*errorMsg/);
  assert.doesNotMatch(server, /error: `[^\n]*\$\{errorMsg\}/);
});
