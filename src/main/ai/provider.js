import { createOpenAiCompatibleProvider } from './providers/openaiCompatible.js'

export { ProviderError } from './errors.js'

/**
 * @typedef {Object} AIProvider
 * @property {string} id
 * @property {(req: {
 *   input: string,
 *   context: { now: string, timezone: string, locale: string, actionIds: string[] },
 *   signal: AbortSignal
 * }) => Promise<{ intents: unknown }>} classify   resolves with the model's raw JSON (validated by the caller)
 * @property {() => Promise<boolean>} healthCheck   resolves true, or throws ProviderError
 */

/** Build the configured provider. Only one concrete implementation (OpenAI-compatible) for v1. */
export function createProvider({ baseUrl, model, apiKey, fetch }) {
  return createOpenAiCompatibleProvider({ baseUrl, model, apiKey, fetch })
}
