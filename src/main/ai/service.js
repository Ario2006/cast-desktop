import { AI_ACTION_IDS, isEnabled, getAction } from '../../shared/actionRegistry.js'
import { AI_MIN_INPUT, AI_MIN_INTERVAL_MS, AI_TIMEOUT_MS } from '../../shared/constants.js'
import { validateIntents } from '../../shared/intents.js'
import { createProvider, ProviderError } from './provider.js'

/**
 * Orchestrates Tier-2 AI classification: availability rules, request cancellation, ~3 req/s
 * throttle, 2.5 s soft timeout, 429 backoff and status reporting. Never throws to callers —
 * failures come back as { ok:false, code } so local suggestions keep working.
 *
 * Status values: 'ready' | 'disabled' | 'not_configured' | 'unauthorized' | 'offline' | 'rate_limited'
 */
export function createAiService({
  getSettings,
  getApiKey,
  getCustomLabels = () => [],
  onStatus = () => {},
  now = Date.now,
  fetch = globalThis.fetch,
  makeProvider = createProvider,
  log
}) {
  const inflight = new Map() // requestId -> AbortController
  let lastRequestAt = 0
  let blockedUntil = 0
  let backoffMs = 0
  let status = 'ready'
  let providerCache = null // { key, provider }
  const cache = new Map() // exact-input answers, so backspacing / retyping is instant
  const CACHE_MAX = 60
  const CACHE_TTL_MS = 2 * 60_000

  function setStatus(next) {
    if (next !== status) {
      status = next
      onStatus(status)
    }
  }

  function provider() {
    const s = getSettings()
    const apiKey = getApiKey()
    const key = `${s.aiProvider}|${s.aiBaseUrl}|${s.aiModel}|${apiKey}`
    if (providerCache?.key !== key) {
      providerCache = {
        key,
        provider: makeProvider({
          provider: s.aiProvider,
          baseUrl: s.aiBaseUrl,
          model: s.aiModel,
          apiKey,
          fetch
        })
      }
    }
    return providerCache.provider
  }

  function availability() {
    const s = getSettings()
    if (!s.smartSuggestions) return 'disabled'
    if (!getApiKey() && !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(s.aiBaseUrl))
      return 'not_configured'
    return null
  }

  return {
    getStatus: () => availability() ?? status,

    cancel(requestId) {
      inflight.get(requestId)?.abort()
      inflight.delete(requestId)
    },

    async classify({ requestId, input, recording = false }) {
      const unavailable = availability()
      if (unavailable) return { ok: false, code: unavailable }
      const text = String(input ?? '').trim()
      if (text.length < AI_MIN_INPUT) return { ok: false, code: 'too_short' }
      const t = now()
      const cacheKey = `${getSettings().aiProvider}|${getSettings().aiModel}|${recording ? 1 : 0}|${text.toLowerCase()}`
      const hit = cache.get(cacheKey)
      if (hit && t - hit.at < CACHE_TTL_MS) return { ok: true, intents: hit.intents, cached: true }
      if (t < blockedUntil) return { ok: false, code: 'rate_limited' }
      if (t - lastRequestAt < AI_MIN_INTERVAL_MS) return { ok: false, code: 'throttled' }
      lastRequestAt = t

      this.cancel(requestId)
      const ctrl = new AbortController()
      inflight.set(requestId, ctrl)
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        ctrl.abort()
      }, AI_TIMEOUT_MS)

      try {
        const settings = getSettings()
        const actionIds = AI_ACTION_IDS.filter((id) =>
          isEnabled(getAction(id), settings, { recording })
        )
        const custom = settings.aiCustomLabels
          ? await Promise.resolve(getCustomLabels()).catch(() => [])
          : []
        // the request may have been cancelled while the custom labels were loading
        if (ctrl.signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' })
        const raw = await provider().classify({
          input: text,
          context: {
            now: new Date(t).toISOString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            locale: Intl.DateTimeFormat().resolvedOptions().locale,
            actionIds,
            custom,
            defaultEventMinutes: settings.defaultEventMinutes
          },
          signal: ctrl.signal
        })
        const { intents, malformed } = validateIntents(raw, {
          allowedIds: [...actionIds, ...custom.map((c) => c.actionId)]
        })
        backoffMs = 0
        setStatus('ready')
        if (malformed) return { ok: false, code: 'bad_response' }
        cache.set(cacheKey, { at: t, intents })
        if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value)
        return { ok: true, intents }
      } catch (e) {
        if (e?.name === 'AbortError') return { ok: false, code: timedOut ? 'timeout' : 'cancelled' }
        if (e instanceof ProviderError) {
          if (e.code === 'unauthorized') setStatus('unauthorized')
          else if (e.code === 'offline') setStatus('offline')
          else if (e.code === 'rate_limited') {
            backoffMs = e.retryAfterMs ?? Math.min(60_000, backoffMs ? backoffMs * 2 : 5000)
            blockedUntil = now() + backoffMs
            setStatus('rate_limited')
          }
          log?.warn('ai classify failed', { code: e.code, status: e.status })
          return { ok: false, code: e.code }
        }
        log?.warn('ai classify error', e)
        return { ok: false, code: 'error' }
      } finally {
        clearTimeout(timer)
        if (inflight.get(requestId) === ctrl) inflight.delete(requestId)
      }
    },

    /** Settings → "Test connection". */
    async test() {
      const unavailable = availability()
      if (unavailable === 'not_configured') return { ok: false, message: 'Add an API key first' }
      try {
        await provider().healthCheck()
        blockedUntil = 0
        setStatus('ready')
        return { ok: true, message: 'Connected' }
      } catch (e) {
        if (e instanceof ProviderError) {
          if (e.code === 'unauthorized') setStatus('unauthorized')
          if (e.code === 'offline') setStatus('offline')
          return { ok: false, message: e.message, code: e.code }
        }
        return { ok: false, message: e?.message ?? 'Failed' }
      }
    }
  }
}
