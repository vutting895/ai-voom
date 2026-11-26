/**
 * Provider-neutral streaming contract for the active chat route.
 * Gemini is the only production adapter until another provider proves
 * parity for streaming, tool calls, cancellation, and error semantics.
 */
export function createGeminiChatRuntime({ googleProvider, streamTextImpl }) {
  if (typeof googleProvider !== "function" || typeof streamTextImpl !== "function") {
    throw new TypeError("Gemini chat runtime requires provider and streamText adapters");
  }

  return {
    stream({
      searchEnabled = false,
      temperature = 0.7,
      maxSteps = 5,
      system,
      messages,
      tools,
      abortSignal,
    }) {
      if (!Array.isArray(messages) || messages.length === 0) {
        throw new TypeError("messages must be a non-empty array");
      }
      if (!Number.isFinite(temperature) || temperature < 0.1 || temperature > 1.5) {
        throw new TypeError("temperature must be between 0.1 and 1.5");
      }
      if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 10) {
        throw new TypeError("maxSteps must be an integer between 1 and 10");
      }

      return streamTextImpl({
        model: googleProvider("gemini-3.6-flash", {
          useSearchGrounding: Boolean(searchEnabled),
        }),
        temperature,
        maxSteps,
        system,
        messages,
        tools,
        ...(abortSignal ? { abortSignal } : {}),
      });
    },
  };
}
