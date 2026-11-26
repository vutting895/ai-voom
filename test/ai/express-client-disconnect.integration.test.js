import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer, request as httpRequest } from "node:http";
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
      const request = httpRequest({
        hostname: "127.0.0.1",
        port: address.port,
        path: "/stream",
        method: "GET",
      }, response => {
        response.once("data", () => {
          request.destroy();
          resolve();
        });
      });
      request.once("error", error => {
        if (error.code !== "ECONNRESET") reject(error);
      });
      request.end();
    });

    let timeout;
    const reason = await Promise.race([
      aborted,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error("disconnect was not observed")), 2000);
      })
    ]);
    clearTimeout(timeout);
    assert.equal(reason?.message, "Client disconnected");
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
