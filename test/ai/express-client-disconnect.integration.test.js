import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { attachResponseAbortSignal } from "../../src/ai/response-abort.js";

test("Express response lifecycle aborts upstream work after a real client disconnect", async () => {
  const app = express();
  let resolveAborted;
  const aborted = new Promise(resolve => { resolveAborted = resolve; });

  app.get("/stream", (req, res) => {
    const { signal, dispose } = attachResponseAbortSignal(res);
    signal.addEventListener("abort", () => {
      dispose();
      resolveAborted(signal.reason);
    }, { once: true });
    res.status(200);
    res.set("Content-Type", "text/plain");
    res.write("partial");
  });

  const server = createServer(app);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address();
    await new Promise((resolve, reject) => {
      const request = createServerRequest(address.port, resolve, reject);
      request.end();
    });
    const reason = await Promise.race([
      aborted,
      new Promise((_, reject) => setTimeout(() => reject(new Error("disconnect was not observed")), 2000))
    ]);
    assert.equal(reason?.message, "Client disconnected");
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

function createServerRequest(port, onDisconnect, onError) {
  const { request } = awaitableHttp();
  const req = request({
    hostname: "127.0.0.1",
    port,
    path: "/stream",
    method: "GET",
  }, response => {
    response.once("data", () => {
      req.destroy();
      onDisconnect();
    });
  });
  req.once("error", error => {
    if (error.code !== "ECONNRESET") onError(error);
  });
  return req;
}

function awaitableHttp() {
  // Lazy import is unnecessary here; Node's built-in HTTP client is synchronous to construct.
  return { request: httpRequest };
}

import { request as httpRequest } from "node:http";
