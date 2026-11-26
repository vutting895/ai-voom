import test from "node:test";
import assert from "node:assert/strict";
import { createServer as createHttpServer, request as httpRequest } from "node:http";

test("authenticated /api/chat disconnect aborts an in-flight tool fetch", async () => {
  const originalEnv = {
    VERCEL: process.env.VERCEL,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  };
  const authServer = createHttpServer((req, res) => {
    if (req.url?.startsWith("/auth/v1/user")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "integration-user", aud: "authenticated", role: "authenticated" }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve, reject) => {
    authServer.once("error", reject);
    authServer.listen(0, "127.0.0.1", resolve);
  });

  let appServer;
  let fetchStarted = false;
  let fetchAborted = false;
  let resolveFetchAborted;
  const toolAborted = new Promise(resolve => { resolveFetchAborted = resolve; });
  const originalFetch = globalThis.fetch;

  try {
    const authPort = authServer.address().port;
    process.env.VERCEL = "1";
    process.env.SUPABASE_URL = `http://127.0.0.1:${authPort}`;
    process.env.SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
    process.env.GEMINI_API_KEY = "test-gemini-key";

    globalThis.fetch = async (input, init = {}) => {
      const url = String(input);
      if (url.includes("official-joke-api.appspot.com")) {
        fetchStarted = true;
        return await new Promise((resolve, reject) => {
          const signal = init.signal;
          if (signal?.aborted) {
            fetchAborted = true;
            resolveFetchAborted(signal.reason);
            reject(signal.reason);
            return;
          }
          signal?.addEventListener("abort", () => {
            fetchAborted = true;
            resolveFetchAborted(signal.reason);
            reject(signal.reason);
          }, { once: true });
        });
      }
      return originalFetch(input, init);
    };

    const { default: app } = await import(`../../server.js?route-e2e=${Date.now()}`);
    app.locals.aiDependencies = {
      createGoogleGenerativeAI: () => () => ({ modelId: "integration-mock" }),
      streamTextImpl: ({ tools, abortSignal }) => ({
        fullStream: (async function* () {
          const toolPromise = tools.call_external_api.execute(
            { source: "joke" },
            { abortSignal },
          );
          yield { type: "text-delta", textDelta: "partial response" };
          await toolPromise;
        })(),
      }),
    };

    appServer = createHttpServer(app);
    await new Promise((resolve, reject) => {
      appServer.once("error", reject);
      appServer.listen(0, "127.0.0.1", resolve);
    });

    await new Promise((resolve, reject) => {
      const req = httpRequest({
        hostname: "127.0.0.1",
        port: appServer.address().port,
        path: "/api/chat",
        method: "POST",
        headers: {
          authorization: "Bearer integration-access-token",
          "content-type": "application/json",
        },
      }, response => {
        response.once("data", () => {
          req.destroy();
          resolve();
        });
      });
      req.once("error", error => {
        if (error.code !== "ECONNRESET") reject(error);
      });
      req.end(JSON.stringify({
        messages: [{ role: "user", content: "Fetch a joke" }],
        autoMemoryEnabled: false,
      }));
    });

    let timeout;
    const reason = await Promise.race([
      toolAborted,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error("tool fetch did not receive abort")), 3000);
      }),
    ]);
    clearTimeout(timeout);
    assert.equal(fetchStarted, true, "route must start the external tool fetch");
    assert.equal(fetchAborted, true, "client disconnect must abort the tool fetch");
    assert.match(reason?.message || String(reason), /Client disconnected/);
  } finally {
    globalThis.fetch = originalFetch;
    if (appServer) await new Promise(resolve => appServer.close(resolve));
    await new Promise(resolve => authServer.close(resolve));
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
