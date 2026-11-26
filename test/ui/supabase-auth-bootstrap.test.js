import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync(new URL("../../public/index.html", import.meta.url), "utf8");

test("VOOM AI interface includes the Supabase sign-in gate", () => {
  assert.match(html, /id="voom-auth-gate"/);
  assert.match(html, /signInWithPassword/);
  assert.match(html, /auth\.signUp/);
  assert.match(html, /auth\.onAuthStateChange/);
});

test("API requests attach the active Supabase access token", () => {
  assert.match(html, /window\.fetch\s*=\s*async function/);
  assert.match(html, /headers\.set\('Authorization',\s*'Bearer '\s*\+\s*currentSession\.access_token\)/);
  assert.match(html, /\/api\/public-config/);
});

test("initial connectivity check waits until a session exists", () => {
  assert.doesNotMatch(html, /load\(\);ra\(\);verifyConnectivity\(\);ub\(\);/);
  assert.match(html, /if \(currentSession && typeof window\.verifyConnectivity === 'function'\)/);
});

test("browser bootstrap does not contain server credentials", () => {
  assert.doesNotMatch(html, /AIzaSy[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(html, /sk-(?:proj|live|test)-[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(html, /SUPABASE_SERVICE_ROLE_KEY|VOOM_ADMIN_TOKEN|GEMINI_API_KEY/);
});
