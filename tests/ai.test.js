import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAiService } from '../src/main/ai/service.js'
import { buildSystemPrompt } from '../src/main/ai/prompt.js'
import { createOpenAiCompatibleProvider } from '../src/main/ai/providers/openaiCompatible.js'
import { ProviderError } from '../src/main/ai/errors.js'
import { DEFAULT_SETTINGS } from '../src/shared/settings.js'

const completion = (content) => ({
  choices: [
    { message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }
  ]
})
const res = (body, init = {}) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init
  })
const ctx = {
  now: '2026-10-22T10:00:00Z',
  timezone: 'Asia/Kolkata',
  locale: 'en-IN',
  actionIds: ['timer.start', 'note.create']
}
const signal = () => new AbortController().signal

describe('OpenAI-compatible provider', () => {
  const intents = {
    intents: [{ actionId: 'timer.start', confidence: 0.9, params: { durationSeconds: 60 } }]
  }

  it('posts a chat completion with JSON mode, the key and the system prompt', async () => {
    const fetch = vi.fn().mockResolvedValue(res(completion(intents)))
    const p = createOpenAiCompatibleProvider({
      baseUrl: 'https://api.example.com/v1/',
      model: 'm',
      apiKey: 'sk-secret',
      fetch
    })
    expect(await p.classify({ input: 'timer 1 min', context: ctx, signal: signal() })).toEqual(
      intents
    )
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://api.example.com/v1/chat/completions')
    expect(init.headers.Authorization).toBe('Bearer sk-secret')
    const body = JSON.parse(init.body)
    expect(body).toMatchObject({
      model: 'm',
      temperature: 0,
      response_format: { type: 'json_object' }
    })
    expect(body.messages[0].content).toContain('timer.start, note.create')
    expect(body.messages[1]).toEqual({ role: 'user', content: 'timer 1 min' })
  })

  it('sends only the query + minimal context (privacy §5.4)', async () => {
    const fetch = vi.fn().mockResolvedValue(res(completion(intents)))
    const p = createOpenAiCompatibleProvider({
      baseUrl: 'https://x/v1',
      model: 'm',
      apiKey: 'k',
      fetch
    })
    await p.classify({ input: 'hello', context: ctx, signal: signal() })
    const sent = fetch.mock.calls[0][1].body
    expect(Object.keys(JSON.parse(sent)).sort()).toEqual([
      'max_tokens',
      'messages',
      'model',
      'response_format',
      'temperature'
    ])
    // the only user-derived content is the typed query; nothing else rides along
    const { messages } = JSON.parse(sent)
    expect(messages).toHaveLength(2)
    expect(messages[1]).toEqual({ role: 'user', content: 'hello' })
  })

  it('tolerates fenced / prose-wrapped JSON', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(res(completion('```json\n' + JSON.stringify(intents) + '\n```')))
    const p = createOpenAiCompatibleProvider({ baseUrl: 'https://x/v1', model: 'm', fetch })
    expect(await p.classify({ input: 'x', context: ctx, signal: signal() })).toEqual(intents)
  })

  it('maps HTTP failures to typed errors', async () => {
    const mk = (r) =>
      createOpenAiCompatibleProvider({
        baseUrl: 'https://x/v1',
        model: 'm',
        fetch: vi.fn().mockResolvedValue(r)
      })
    await expect(
      mk(res({}, { status: 401 })).classify({ input: 'x', context: ctx, signal: signal() })
    ).rejects.toMatchObject({ code: 'unauthorized' })
    await expect(
      mk(res({}, { status: 429, headers: { 'retry-after': '7' } })).classify({
        input: 'x',
        context: ctx,
        signal: signal()
      })
    ).rejects.toMatchObject({ code: 'rate_limited', retryAfterMs: 7000 })
    await expect(
      mk(res('oops', { status: 500 })).classify({ input: 'x', context: ctx, signal: signal() })
    ).rejects.toMatchObject({ code: 'http', status: 500 })
    await expect(
      mk(res(completion('no json here'))).classify({ input: 'x', context: ctx, signal: signal() })
    ).rejects.toMatchObject({ code: 'bad_response' })
  })

  it('network errors become "offline"; aborts propagate untouched', async () => {
    const offline = createOpenAiCompatibleProvider({
      baseUrl: 'https://x/v1',
      model: 'm',
      fetch: vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    })
    await expect(
      offline.classify({ input: 'x', context: ctx, signal: signal() })
    ).rejects.toMatchObject({ code: 'offline' })
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' })
    const p = createOpenAiCompatibleProvider({
      baseUrl: 'https://x/v1',
      model: 'm',
      fetch: vi.fn().mockRejectedValue(abort)
    })
    await expect(p.classify({ input: 'x', context: ctx, signal: signal() })).rejects.toMatchObject({
      name: 'AbortError'
    })
  })

  it('retries once without response_format when the server rejects it', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(res('unsupported', { status: 400 }))
      .mockImplementation(async () => res(completion(intents)))
    const p = createOpenAiCompatibleProvider({ baseUrl: 'https://x/v1', model: 'm', fetch })
    expect(await p.classify({ input: 'x', context: ctx, signal: signal() })).toEqual(intents)
    expect(JSON.parse(fetch.mock.calls[1][1].body)).not.toHaveProperty('response_format')
    await p.classify({ input: 'y', context: ctx, signal: signal() }) // remembered
    expect(JSON.parse(fetch.mock.calls[2][1].body)).not.toHaveProperty('response_format')
  })

  it('healthCheck resolves true or throws', async () => {
    const ok = createOpenAiCompatibleProvider({
      baseUrl: 'https://x/v1',
      model: 'm',
      fetch: vi.fn().mockResolvedValue(res(completion('{"ok":true}')))
    })
    expect(await ok.healthCheck()).toBe(true)
    const bad = createOpenAiCompatibleProvider({
      baseUrl: 'https://x/v1',
      model: 'm',
      fetch: vi.fn().mockResolvedValue(res({}, { status: 401 }))
    })
    await expect(bad.healthCheck()).rejects.toBeInstanceOf(ProviderError)
  })

  it('prompt interpolates context and every action id', () => {
    const p = buildSystemPrompt(ctx)
    expect(p).toContain('Asia/Kolkata')
    expect(p).toContain('2026-10-22T10:00:00Z')
    expect(p).not.toContain('{{')
  })
})

describe('AI service', () => {
  let clock
  let statuses
  const settings = (over = {}) => ({ ...DEFAULT_SETTINGS, ...over })
  const intents = {
    intents: [
      { actionId: 'timer.start', confidence: 0.9, params: { durationSeconds: 60 }, title: 'T' }
    ]
  }

  const make = (providerImpl, { s = settings(), key = 'k' } = {}) =>
    createAiService({
      getSettings: () => s,
      getApiKey: () => key,
      onStatus: (x) => statuses.push(x),
      now: () => clock,
      makeProvider: () => providerImpl
    })

  beforeEach(() => {
    vi.useFakeTimers()
    clock = 1_000_000
    statuses = []
  })
  afterEach(() => vi.useRealTimers())

  it('returns validated intents', async () => {
    const svc = make({ classify: async () => intents })
    const r = await svc.classify({ requestId: '1', input: 'timer one minute' })
    expect(r).toMatchObject({ ok: true })
    expect(r.intents[0]).toMatchObject({ actionId: 'timer.start', params: { durationSeconds: 60 } })
  })

  it('drops invalid / unknown intents from the model', async () => {
    const svc = make({
      classify: async () => ({
        intents: [{ actionId: 'format.disk', confidence: 1, params: {} }, ...intents.intents]
      })
    })
    expect((await svc.classify({ requestId: '1', input: 'whatever' })).intents).toHaveLength(1)
  })

  it('reports malformed model output as an error, not a crash', async () => {
    const svc = make({ classify: async () => ({ nope: true }) })
    expect(await svc.classify({ requestId: '1', input: 'whatever' })).toEqual({
      ok: false,
      code: 'bad_response'
    })
  })

  it('is skipped when disabled, unconfigured, or the input is too short', async () => {
    const never = { classify: vi.fn() }
    expect(
      await make(never, { s: settings({ smartSuggestions: false }) }).classify({
        requestId: '1',
        input: 'timer'
      })
    ).toEqual({ ok: false, code: 'disabled' })
    expect(await make(never, { key: null }).classify({ requestId: '1', input: 'timer' })).toEqual({
      ok: false,
      code: 'not_configured'
    })
    expect(await make(never).classify({ requestId: '1', input: 'ab' })).toEqual({
      ok: false,
      code: 'too_short'
    })
    expect(never.classify).not.toHaveBeenCalled()
  })

  it('works without a key against a localhost server (Ollama / LM Studio)', async () => {
    const svc = make(
      { classify: async () => intents },
      { s: settings({ aiBaseUrl: 'http://localhost:11434/v1' }), key: null }
    )
    expect((await svc.classify({ requestId: '1', input: 'timer 1m' })).ok).toBe(true)
  })

  it('cancel() aborts an in-flight request', async () => {
    const svc = make({
      classify: ({ signal }) =>
        new Promise((_, rej) =>
          signal.addEventListener('abort', () =>
            rej(Object.assign(new Error('x'), { name: 'AbortError' }))
          )
        )
    })
    const p = svc.classify({ requestId: 'r', input: 'something long' })
    svc.cancel('r')
    expect(await p).toEqual({ ok: false, code: 'cancelled' })
  })

  it('enforces the 2.5 s timeout without marking the service offline', async () => {
    const svc = make({
      classify: ({ signal }) =>
        new Promise((_, rej) =>
          signal.addEventListener('abort', () =>
            rej(Object.assign(new Error('x'), { name: 'AbortError' }))
          )
        )
    })
    const p = svc.classify({ requestId: 'r', input: 'something long' })
    await vi.advanceTimersByTimeAsync(2600)
    expect(await p).toEqual({ ok: false, code: 'timeout' })
    expect(svc.getStatus()).toBe('ready')
  })

  it('throttles to ~3 requests/second', async () => {
    const svc = make({ classify: async () => intents })
    expect((await svc.classify({ requestId: '1', input: 'timer 1m' })).ok).toBe(true)
    clock += 100
    expect(await svc.classify({ requestId: '2', input: 'timer 2m' })).toEqual({
      ok: false,
      code: 'throttled'
    })
    clock += 400
    expect((await svc.classify({ requestId: '3', input: 'timer 3m' })).ok).toBe(true)
  })

  it('401 → status "unauthorized"', async () => {
    const svc = make({
      classify: async () => {
        throw new ProviderError('unauthorized', 'no')
      }
    })
    expect(await svc.classify({ requestId: '1', input: 'timer 1m' })).toEqual({
      ok: false,
      code: 'unauthorized'
    })
    expect(svc.getStatus()).toBe('unauthorized')
    expect(statuses).toEqual(['unauthorized'])
  })

  it('429 → backs off (exponentially) and recovers afterwards', async () => {
    let calls = 0
    const svc = make({
      classify: async () => {
        calls++
        if (calls <= 2) throw new ProviderError('rate_limited', 'slow')
        return intents
      }
    })
    expect((await svc.classify({ requestId: '1', input: 'timer 1m' })).code).toBe('rate_limited')
    expect(svc.getStatus()).toBe('rate_limited')
    clock += 1000
    expect(await svc.classify({ requestId: '2', input: 'timer 2m' })).toEqual({
      ok: false,
      code: 'rate_limited'
    }) // blocked locally
    expect(calls).toBe(1)
    clock += 5000
    expect((await svc.classify({ requestId: '3', input: 'timer 3m' })).code).toBe('rate_limited') // second 429 doubles the wait
    clock += 6000
    expect(await svc.classify({ requestId: '4', input: 'timer 4m' })).toEqual({
      ok: false,
      code: 'rate_limited'
    })
    clock += 5000
    expect((await svc.classify({ requestId: '5', input: 'timer 5m' })).ok).toBe(true)
    expect(svc.getStatus()).toBe('ready')
  })

  it('network failure → "offline", then recovers on success', async () => {
    let fail = true
    const svc = make({
      classify: async () => {
        if (fail) throw new ProviderError('offline', 'x')
        return intents
      }
    })
    await svc.classify({ requestId: '1', input: 'timer 1m' })
    expect(svc.getStatus()).toBe('offline')
    fail = false
    clock += 1000
    await svc.classify({ requestId: '2', input: 'timer 2m' })
    expect(svc.getStatus()).toBe('ready')
    expect(statuses).toEqual(['offline', 'ready'])
  })

  it('test() reports success and failures with messages', async () => {
    expect(await make({ healthCheck: async () => true }).test()).toEqual({
      ok: true,
      message: 'Connected'
    })
    const r = await make({
      healthCheck: async () => {
        throw new ProviderError('unauthorized', 'API key rejected')
      }
    }).test()
    expect(r).toMatchObject({ ok: false, message: 'API key rejected' })
    expect(await make({ healthCheck: async () => true }, { key: null }).test()).toEqual({
      ok: false,
      message: 'Add an API key first'
    })
  })
})
