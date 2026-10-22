import { createOpenAiCompatibleProvider } from './providers/openaiCompatible.js'
import { createOpenjevProvider } from './providers/openjev.js'

export { ProviderError } from './errors.js'

/**
 * @typedef {Object} AIProvider
 * @property {string} id
 * @property {(req: {
 *   input: string,
 *   context: { now: string, timezone: string, locale: string, actionIds: string[], defaultEventMinutes: number },
 *   signal: AbortSignal
 * }) => Promise<{ intents: unknown }>} classify   resolves with intents (always re-validated by the caller)
 * @property {() => Promise<boolean>} healthCheck   resolves true, or throws ProviderError
 */

/** Build the configured provider (`provider` is the `aiProvider` setting). */
export function createProvider({ provider = 'openjev', baseUrl, model, apiKey, fetch }) {
  const make =
    provider === 'openai-compatible' ? createOpenAiCompatibleProvider : createOpenjevProvider
  return make({ baseUrl, model, apiKey, fetch })
}
