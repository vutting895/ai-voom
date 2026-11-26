/**
 * Connect an HTTP response lifecycle to an AbortSignal for upstream work.
 * Normal response completion must not be treated as a client disconnect.
 */
export function attachResponseAbortSignal(response) {
  const controller = new AbortController();
  const onClose = () => {
    if (!response.writableEnded && !controller.signal.aborted) {
      controller.abort(new Error("Client disconnected"));
    }
  };

  response.once("close", onClose);
  return {
    signal: controller.signal,
    dispose() {
      response.removeListener("close", onClose);
    },
  };
}
