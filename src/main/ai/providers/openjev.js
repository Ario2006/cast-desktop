import { getAction } from '../../../shared/actionRegistry.js'
import { AI_MAX_INTENTS } from '../../../shared/constants.js'
import { inferParams } from '../../../shared/inferParams.js'
import { ProviderError } from '../errors.js'

/** Label for "nothing fits" so the classifier is never forced into a bad match. */
const NONE = 'none'
const NONE_HINT = 'None of the tools fit: ordinary text, a question, or something else entirely.'
const INSTRUCTIONS =
  'The user is typing a request into a keyboard launcher. Which tool best fits what they want to do?'
/** Ignore candidates the model gives less than this probability. */
export const MIN_PROBABILITY = 0.12
/** Second question, answered in the same request: what *kind* of text is this? */
const KIND_QUESTION = {
  type: 'choice',
  instructions: 'What kind of text is the user typing?',
  criteria: {
    command: 'A request to do something: set, start, book, remind, take, record, open, note, find…',
    question: 'A factual question, or a topic to look up on the web.',
    other: 'A fragment, gibberish or text that is neither a command nor a question.'
  }
}
const NOISE_CUTOFF = 0.75 // "other" this confident => suggest nothing
const QUESTION_CUTOFF = 0.6 // "question" this confident => make sure web search is offered

const join = (base, path) => `${base.replace(/\/+$/, '')}${path}`

/**
 * Openjev (TypeSafe AI "System One"): a *classifier*. One `choice` question over the available
 * tools returns a label and per-label probabilities — no free-form generation. Cast ranks the
 * likeliest tools from those probabilities and fills in their parameters locally (inferParams).
 *
 * POST {base}/v1/systemone   Authorization: Bearer <key>
 *   { state, model, questions: { tool: { type: "choice", instructions, criteria } } }
 * -> { model, usage, answers: { tool: { type: "choice", choice, confidence, probabilities } } }
 */
export function createOpenjevProvider({ baseUrl, model, apiKey, fetch = globalThis.fetch }) {
  async function call(method, path, body, signal) {
    let res
    try {
      res = await fetch(join(baseUrl, path), {
        method,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
          ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        body: body ? JSON.stringify(body) : undefined,
        signal
      })
    } catch (e) {
      if (e?.name === 'AbortError') throw e
      throw new ProviderError('offline', 'Network error')
    }
    if (res.status === 401 || res.status === 403) {
      throw new ProviderError('unauthorized', 'API key rejected', { status: res.status })
    }
    if (res.status === 429) {
      const ms = Number(res.headers?.get?.('retry-after-ms'))
      const s = Number(res.headers?.get?.('retry-after'))
      const retryAfterMs =
        Number.isFinite(ms) && ms > 0 ? ms : Number.isFinite(s) && s > 0 ? s * 1000 : undefined
      throw new ProviderError('rate_limited', 'Rate limited', { status: 429, retryAfterMs })
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
    try {
      return await res.json()
    } catch {
      throw new ProviderError('bad_response', 'Response was not JSON')
    }
  }

  return {
    id: 'openjev',

    async classify({ input, context, signal }) {
      const ids = context.actionIds.filter((id) => getAction(id)?.aiHint)
      if (ids.length === 0) return { intents: [] }

      const criteria = Object.fromEntries(ids.map((id) => [id, getAction(id).aiHint]))
      criteria[NONE] = NONE_HINT
      const payload = await call(
        'POST',
        '/v1/systemone',
        {
          state: input,
          model,
          questions: {
            tool: { type: 'choice', instructions: INSTRUCTIONS, criteria },
            kind: KIND_QUESTION
          }
        },
        signal
      )

      const answer = payload?.answers?.tool
      if (!answer || answer.type !== 'choice' || typeof answer.probabilities !== 'object') {
        throw new ProviderError('bad_response', 'Unexpected classifier response')
      }

      const inferCtx = {
        now: new Date(context.now),
        defaultEventMinutes: context.defaultEventMinutes
      }
      const intents = []
      const ranked = Object.entries(answer.probabilities)
        .filter(
          ([label, p]) =>
            label !== NONE && ids.includes(label) && Number.isFinite(p) && p >= MIN_PROBABILITY
        )
        .sort((a, b) => b[1] - a[1])
      // Use the "kind" answer (optional: older responses may omit it) to cut noise / surface search.
      const kind = payload?.answers?.kind
      const kp = kind?.type === 'choice' ? kind.probabilities : null
      if (kp?.other >= NOISE_CUTOFF) return { intents: [] }
      if (kp?.question >= QUESTION_CUTOFF && ids.includes('web.search')) {
        const i = ranked.findIndex(([id]) => id === 'web.search')
        if (i === -1) ranked.push(['web.search', kp.question])
        else ranked[i][1] = Math.max(ranked[i][1], kp.question)
        ranked.sort((a, b) => b[1] - a[1])
      }
      for (const [actionId, confidence] of ranked) {
        if (intents.length >= AI_MAX_INTENTS) break
        const params = inferParams(actionId, input, inferCtx)
        if (params) intents.push({ actionId, confidence, params })
      }
      return { intents }
    },

    /** Lists models: cheap, authenticated, and exercises the key + base URL. */
    async healthCheck() {
      await call('GET', '/v1/models')
      return true
    }
  }
}
