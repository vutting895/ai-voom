import test from "node:test";
import assert from "node:assert/strict";
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
