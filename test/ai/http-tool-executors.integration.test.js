import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { fetchWikipediaSummary, fetchExternalApi } from "../../src/ai/http-tool-executors.js";

function abortableFetchProbe() {
  const controller = new AbortController();
  let receivedSignal;
  const fetchImpl = (_url, options = {}) => {
    receivedSignal = options.signal;
    return new Promise((_resolve, reject) => {
      if (receivedSignal.aborted) {
        reject(receivedSignal.reason);
        return;
      }
      receivedSignal.addEventListener("abort", () => reject(receivedSignal.reason), { once: true });
    });
  };
  return { controller, fetchImpl, get receivedSignal() { return receivedSignal; } };
}

test("Wikipedia fetch receives and reacts to the request AbortSignal", async () => {
  const probe = abortableFetchProbe();
  const task = fetchWikipediaSummary("NOVA", { signal: probe.controller.signal, fetchImpl: probe.fetchImpl });
  assert.equal(probe.receivedSignal, probe.controller.signal);
  const reason = new Error("Client disconnected");
  probe.controller.abort(reason);
  await assert.rejects(task, error => error === reason);
});

test("external API fetch receives and reacts to the request AbortSignal", async () => {
  const probe = abortableFetchProbe();
  const task = fetchExternalApi("crypto", { signal: probe.controller.signal, fetchImpl: probe.fetchImpl });
  assert.equal(probe.receivedSignal, probe.controller.signal);
  const reason = new Error("Client disconnected");
  probe.controller.abort(reason);
  await assert.rejects(task, error => error === reason);
});

test("non-abort HTTP errors preserve the tool error contract", async () => {
  const failure = new Error("upstream unavailable");
  const fetchImpl = async () => { throw failure; };
  assert.deepEqual(await fetchWikipediaSummary("NOVA", { fetchImpl }), {
    error: "upstream unavailable",
    success: false
  });
  assert.deepEqual(await fetchExternalApi("crypto", { fetchImpl }), {
    error: "upstream unavailable",
    success: false
  });
});

test("Wikipedia executor returns parsed results on a successful response", async () => {
  let calledUrl = "";
  const fetchImpl = async (url, options) => {
    calledUrl = url;
    assert.equal(options.signal, undefined);
    return {
      ok: true,
      json: async () => ({
        title: "NOVA",
        extract: "Summary",
        content_urls: { desktop: { page: "https://example.test/nova" } }
      })
    };
  };
  assert.deepEqual(await fetchWikipediaSummary("NOVA", { fetchImpl }), {
    title: "NOVA",
    summary: "Summary",
    url: "https://example.test/nova",
    success: true
  });
  assert.match(calledUrl, /wikipedia.org/);
});

test("external API executor returns parsed results on a successful response", async () => {
  const fetchImpl = async (_url, options) => {
    assert.equal(options.signal, undefined);
    return { ok: true, json: async () => ({ price: 123 }) };
  };
  const result = await fetchExternalApi("crypto", { fetchImpl });
  assert.equal(result.success, true);
  assert.equal(result.source, "crypto");
  assert.deepEqual(result.data, { price: 123 });
});

async function assertNativeFetchAbort(execute) {
  let resolveStarted;
  let resolveDisconnected;
  let disconnectedOnce = false;
  const started = new Promise(resolve => { resolveStarted = resolve; });
  const disconnected = new Promise(resolve => { resolveDisconnected = resolve; });
  const server = createServer((request, response) => {
    resolveStarted();
    const markDisconnected = () => {
      if (!disconnectedOnce) {
        disconnectedOnce = true;
        resolveDisconnected();
      }
    };
    request.once("aborted", markDisconnected);
    response.once("close", () => {
      if (!response.writableEnded) markDisconnected();
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const controller = new AbortController();
    const localUrl = `http://127.0.0.1:${server.address().port}/slow`;
    const fetchImpl = (_url, options) => fetch(localUrl, options);
    const task = execute(controller.signal, fetchImpl);
    await started;
    const reason = new Error("Native fetch aborted by client disconnect");
    controller.abort(reason);
    await assert.rejects(task, error => error === reason);
    await Promise.race([
      disconnected,
      new Promise((_, reject) => setTimeout(() => reject(new Error("local HTTP server did not observe abort")), 2000))
    ]);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

test("Wikipedia executor cancels a real Node fetch against a local HTTP server", async () => {
  await assertNativeFetchAbort((signal, fetchImpl) =>
    fetchWikipediaSummary("NOVA", { signal, fetchImpl })
  );
});

test("external API executor cancels a real Node fetch against a local HTTP server", async () => {
  await assertNativeFetchAbort((signal, fetchImpl) =>
    fetchExternalApi("crypto", { signal, fetchImpl })
  );
});
