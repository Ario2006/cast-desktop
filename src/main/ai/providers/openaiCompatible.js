import { extractJson } from '../../../shared/intents.js'
import { ProviderError } from '../errors.js'
import { buildSystemPrompt } from '../prompt.js'

const join = (base, path) => `${base.replace(/\/+$/, '')}${path}`

/**
 * Any server that speaks the OpenAI chat-completions protocol (OpenAI, OpenRouter, Ollama,
 * LM Studio, most gateways). Base URL, model and key are all configurable in Settings.
 */
export function createOpenAiCompatibleProvider({
  baseUrl,
  model,
  apiKey,
  fetch = globalThis.fetch
}) {
  let jsonModeSupported = true

  async function post(body, signal) {
    let res
    try {
      res = await fetch(join(baseUrl, '/chat/completions'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
        },
        body: JSON.stringify(body),
        signal
      })
    } catch (e) {
      if (e?.name === 'AbortError') throw e
      throw new ProviderError('offline', 'Network error')
    }
    if (res.status === 401 || res.status === 403)
      throw new ProviderError('unauthorized', 'API key rejected', { status: res.status })
    if (res.status === 429) {
      const ra = Number(res.headers?.get?.('retry-after'))
      throw new ProviderError('rate_limited', 'Rate limited', {
        status: 429,
        retryAfterMs: Number.isFinite(ra) && ra > 0 ? ra * 1000 : undefined
      })
    }
    if (!res.ok) {
      let detail = ''
      try {
        detail = (await res.text()).slice(0, 200)
      } catch {
        /* ignore */
      }
      throw new ProviderError('http', `HTTP ${res.status}${detail ? `: ${detail}` : ''}`, {
        status: res.status
      })
    }
    return res
  }

  async function chat(messages, { signal, maxTokens = 400 } = {}) {
    const base = { model, messages, temperature: 0, max_tokens: maxTokens }
    try {
      return await post(
        jsonModeSupported ? { ...base, response_format: { type: 'json_object' } } : base,
        signal
      )
    } catch (e) {
      // Some compatible servers reject response_format: retry once without it and remember.
      if (
        e instanceof ProviderError &&
        e.code === 'http' &&
        e.status === 400 &&
        jsonModeSupported
      ) {
        jsonModeSupported = false
        return post(base, signal)
      }
      throw e
    }
  }

  return {
    id: 'openai-compatible',

    async classify({ input, context, signal }) {
      const res = await chat(
        [
          { role: 'system', content: buildSystemPrompt(context) },
          { role: 'user', content: input }
        ],
        { signal }
      )
      let payload
      try {
        payload = await res.json()
      } catch {
        throw new ProviderError('bad_response', 'Response was not JSON')
      }
      const content = payload?.choices?.[0]?.message?.content
      const json = extractJson(content)
      if (!json) throw new ProviderError('bad_response', 'Model did not return JSON')
      return json
    },

    async healthCheck() {
      const res = await chat([{ role: 'user', content: 'Reply with {"ok":true}' }], {
        maxTokens: 20
      })
      await res.text().catch(() => '')
      return true
    }
  }
}
