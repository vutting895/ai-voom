/**
 * Bind a request AbortSignal to an AI SDK tool definition.
 * Tool implementations receive the signal in execute options and should pass
 * it to cancellable I/O such as fetch().
 */
export function bindToolAbortSignal(toolDefinition, signal) {
  if (!toolDefinition || typeof toolDefinition.execute !== "function") {
    throw new TypeError("tool definition must expose execute()");
  }
  const execute = toolDefinition.execute;
  toolDefinition.execute = async (input, options = {}) => {
    const abortSignal = options.abortSignal ?? signal;
    if (abortSignal?.aborted) {
      throw abortSignal.reason ?? new Error("Tool execution aborted");
    }
    return execute(input, { ...options, abortSignal });
  };
  return toolDefinition;
}
