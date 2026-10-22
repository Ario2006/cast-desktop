import { describe, expect, it, vi } from 'vitest'
import { ProviderError } from '../src/main/ai/errors.js'
import { createProvider } from '../src/main/ai/provider.js'
import { createOpenjevProvider, MIN_PROBABILITY } from '../src/main/ai/providers/openjev.js'
import { createAiService } from '../src/main/ai/service.js'
import { AI_ACTION_IDS } from '../src/shared/actionRegistry.js'
import { inferParams } from '../src/shared/inferParams.js'
import { DEFAULT_SETTINGS } from '../src/shared/settings.js'

const NOW = new Date(2026, 9, 22, 10, 0, 0)
const ctx = {
  now: NOW.toISOString(),
  timezone: 'UTC',
  locale: 'en',
  actionIds: AI_ACTION_IDS,
  defaultEventMinutes: 30
}
const json = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init
  })
const answer = (probabilities) => {
  const [choice, confidence] = Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0]
  return {
    model: 'jev-latest',
    usage: { input_tokens: 1, output_tokens: 1 },
    answers: { tool: { type: 'choice', choice, confidence, probabilities } }
  }
}
const signal = () => new AbortController().signal
const make = (fetch) =>
  createOpenjevProvider({
    baseUrl: 'https://api.codiv.ai/',
    model: 'jev-latest',
    apiKey: 'sk-test',
    fetch
  })

describe('Openjev classifier provider', () => {
  it('posts one choice question with a described label per tool to /v1/systemone', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(async () => json(answer({ 'timer.start': 0.9, none: 0.1 })))
    await make(fetch).classify({ input: 'cook pasta 10 minutes', context: ctx, signal: signal() })
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://api.codiv.ai/v1/systemone')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer sk-test')
    const body = JSON.parse(init.body)
    expect(body.model).toBe('jev-latest')
    expect(body.state).toBe('cook pasta 10 minutes')
    const q = body.questions.tool
    expect(q.type).toBe('choice')
    expect(Object.keys(q.criteria).sort()).toEqual([...AI_ACTION_IDS, 'none'].sort())
    expect(q.criteria['timer.start']).toMatch(/timer/i)
    // only the query is sent as user data
    expect(Object.keys(body).sort()).toEqual(['model', 'questions', 'state'])
  })

  it('turns probabilities into ranked intents and fills params locally', async () => {
    const fetch = vi.fn().mockImplementation(async () =>
      json(
        answer({
          'timer.start': 0.7,
          'reminder.create': 0.2,
          'calendar.create': 0.05,
          none: 0.05
        })
      )
    )
    const { intents } = await make(fetch).classify({
      input: 'pasta 10 minutes',
      context: ctx,
      signal: signal()
    })
    expect(intents.map((i) => i.actionId)).toEqual(['timer.start', 'reminder.create'])
    expect(intents[0]).toMatchObject({ confidence: 0.7, params: { durationSeconds: 600 } })
  })

  it('"none" winning (or nothing above the threshold) yields no intents', async () => {
    const mk = (p) => make(vi.fn().mockImplementation(async () => json(answer(p))))
    expect(
      (
        await mk({ none: 0.9, 'web.search': 0.1 }).classify({
          input: 'hello',
          context: ctx,
          signal: signal()
        })
      ).intents
    ).toEqual([])
    expect(MIN_PROBABILITY).toBeGreaterThan(0.05)
  })

  it('ignores labels it was not offered and caps at 4 intents', async () => {
    const probs = {
      'timer.start': 0.2,
      'stopwatch.start': 0.2,
      'note.create': 0.2,
      'web.search': 0.2,
      'screenshot.full': 0.19,
      'made.up': 0.9,
      none: 0.01
    }
    const { intents } = await make(
      vi.fn().mockImplementation(async () => json(answer(probs)))
    ).classify({ input: 'x', context: ctx, signal: signal() })
    expect(intents).toHaveLength(4)
    expect(intents.some((i) => i.actionId === 'made.up')).toBe(false)
  })

  it('drops intents whose params cannot be built (web.openUrl without a URL)', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(async () => json(answer({ 'web.openUrl': 0.8, 'web.search': 0.2 })))
    const { intents } = await make(fetch).classify({
      input: 'open the thing',
      context: ctx,
      signal: signal()
    })
    expect(intents.map((i) => i.actionId)).toEqual(['web.search'])
  })

  it('only offers tools the caller allows', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(async () => json(answer({ 'note.create': 0.9, none: 0.1 })))
    await make(fetch).classify({
      input: 'x',
      context: { ...ctx, actionIds: ['note.create', 'record.stop'] },
      signal: signal()
    })
    expect(
      Object.keys(JSON.parse(fetch.mock.calls[0][1].body).questions.tool.criteria).sort()
    ).toEqual(['none', 'note.create'])
  })

  it('maps failures: 401, 429 (retry-after-ms wins), 5xx, offline, bad shapes', async () => {
    const run = (fetchImpl) =>
      make(fetchImpl).classify({ input: 'x', context: ctx, signal: signal() })
    await expect(run(vi.fn().mockResolvedValue(json({}, { status: 401 })))).rejects.toMatchObject({
      code: 'unauthorized'
    })
    await expect(
      run(
        vi
          .fn()
          .mockResolvedValue(
            json({}, { status: 429, headers: { 'retry-after': '9', 'retry-after-ms': '1500' } })
          )
      )
    ).rejects.toMatchObject({ code: 'rate_limited', retryAfterMs: 1500 })
    await expect(
      run(vi.fn().mockResolvedValue(new Response('boom', { status: 503 })))
    ).rejects.toMatchObject({ code: 'http', status: 503 })
    await expect(
      run(vi.fn().mockRejectedValue(new TypeError('fetch failed')))
    ).rejects.toMatchObject({ code: 'offline' })
    await expect(run(vi.fn().mockResolvedValue(json({ answers: {} })))).rejects.toMatchObject({
      code: 'bad_response'
    })
    await expect(
      run(vi.fn().mockResolvedValue(new Response('<html>', { status: 200 })))
    ).rejects.toMatchObject({ code: 'bad_response' })
  })

  it('healthCheck hits /v1/models with the key', async () => {
    const fetch = vi.fn().mockResolvedValue(json({ models: [] }))
    expect(await make(fetch).healthCheck()).toBe(true)
    expect(fetch.mock.calls[0][0]).toBe('https://api.codiv.ai/v1/models')
    expect(fetch.mock.calls[0][1].method).toBe('GET')
    await expect(
      make(vi.fn().mockResolvedValue(json({}, { status: 401 }))).healthCheck()
    ).rejects.toBeInstanceOf(ProviderError)
  })

  it('factory picks the provider by id (default Openjev)', () => {
    expect(createProvider({ baseUrl: 'https://x', model: 'm', apiKey: 'k' }).id).toBe('openjev')
    expect(
      createProvider({
        provider: 'openai-compatible',
        baseUrl: 'https://x',
        model: 'm',
        apiKey: 'k'
      }).id
    ).toBe('openai-compatible')
  })
})

describe('end-to-end through the AI service', () => {
  it('validates, returns ready-to-render intents and carries the default event length', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(async () => json(answer({ 'calendar.create': 0.8, none: 0.2 })))
    const svc = createAiService({
      getSettings: () => ({ ...DEFAULT_SETTINGS, defaultEventMinutes: 45 }),
      getApiKey: () => 'k',
      fetch
    })
    const r = await svc.classify({ requestId: '1', input: 'dentist friday 3pm' })
    expect(r.ok).toBe(true)
    expect(r.intents[0]).toMatchObject({
      actionId: 'calendar.create',
      confidence: 0.8,
      params: { title: 'Dentist' }
    })
    const { start, end } = r.intents[0].params
    expect(Date.parse(end) - Date.parse(start)).toBe(45 * 60_000) // the configured default length
  })
})

describe('inferParams', () => {
  const at = (id, text) => inferParams(id, text, { now: NOW, defaultEventMinutes: 30 })
  it('timer: duration + label from natural phrasing', () => {
    expect(at('timer.start', 'cook the pasta for 10 minutes')).toEqual({
      durationSeconds: 600,
      label: 'cook the pasta'
    })
    expect(at('timer.start', 'a timer please')).toEqual({})
  })
  it('reminder: text and time, with or without the leading verb', () => {
    const r = at('reminder.create', 'call mom tomorrow at 5pm')
    expect(r.text).toBe('Call mom')
    expect(new Date(r.remindAt).getHours()).toBe(17)
    expect(at('reminder.create', 'remind me to stretch in 30 min').text).toBe('Stretch')
  })
  it('calendar: pre-fills a draft even without an explicit keyword', () => {
    const e = at('calendar.create', 'dentist friday 3pm 1 hour')
    expect(e.title).toBe('Dentist')
    expect(Date.parse(e.end) - Date.parse(e.start)).toBe(3600_000)
    expect(at('calendar.create', 'standup').title).toBe('Standup')
  })
  it('notes, search, url and passthrough actions', () => {
    expect(at('note.create', 'note buy milk')).toEqual({ body: 'buy milk' })
    expect(at('notes.search', 'search notes for passport')).toEqual({ query: 'passport' })
    expect(at('web.search', 'capital of france')).toEqual({ query: 'capital of france' })
    expect(at('web.openUrl', 'github.com/foo')).toEqual({ url: 'https://github.com/foo' })
    expect(at('web.openUrl', 'open the thing')).toBeNull()
    expect(at('screenshot.full', 'grab my screen')).toEqual({})
    expect(at('timer.start', '   ')).toBeNull()
  })
})

describe('Openjev second question (kind) and caching', () => {
  const withKind = (tool, kind) => ({
    ...answer(tool),
    answers: {
      ...answer(tool).answers,
      kind: { type: 'choice', choice: 'x', confidence: 1, probabilities: kind }
    }
  })
  const run = (payload) =>
    createOpenjevProvider({
      baseUrl: 'https://x',
      model: 'm',
      apiKey: 'k',
      fetch: vi.fn().mockImplementation(async () => json(payload))
    }).classify({
      input: 'some text',
      context: ctx,
      signal: signal()
    })

  it('asks the kind question in the same request', async () => {
    const fetch = vi.fn().mockImplementation(async () => json(answer({ none: 1 })))
    await createOpenjevProvider({ baseUrl: 'https://x', model: 'm', apiKey: 'k', fetch }).classify({
      input: 'x',
      context: ctx,
      signal: signal()
    })
    const q = JSON.parse(fetch.mock.calls[0][1].body).questions
    expect(Object.keys(q)).toEqual(['tool', 'kind'])
    expect(Object.keys(q.kind.criteria)).toEqual(['command', 'question', 'other'])
  })

  it('suppresses suggestions for confident noise', async () => {
    const r = await run(
      withKind({ 'timer.start': 0.5, none: 0.5 }, { other: 0.9, command: 0.05, question: 0.05 })
    )
    expect(r.intents).toEqual([])
  })

  it('surfaces web search for confident questions, even if the tool question missed it', async () => {
    const r = await run(
      withKind({ none: 0.7, 'note.create': 0.3 }, { question: 0.8, command: 0.1, other: 0.1 })
    )
    expect(r.intents[0]).toMatchObject({ actionId: 'web.search', confidence: 0.8 })
    expect(r.intents.map((i) => i.actionId)).toContain('note.create')
  })

  it('still works when the response has no kind answer', async () => {
    expect((await run(answer({ 'timer.start': 0.9, none: 0.1 }))).intents[0].actionId).toBe(
      'timer.start'
    )
  })

  it('the service answers repeated input from cache without another request', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(async () => json(answer({ 'stopwatch.start': 0.9, none: 0.1 })))
    let clock = 1_000_000
    const svc = createAiService({
      getSettings: () => DEFAULT_SETTINGS,
      getApiKey: () => 'k',
      fetch,
      now: () => clock
    })
    expect((await svc.classify({ requestId: '1', input: 'stopwatch please' })).ok).toBe(true)
    clock += 50 // inside the throttle window: a cache hit must not care
    const again = await svc.classify({ requestId: '2', input: 'Stopwatch Please' })
    expect(again).toMatchObject({ ok: true, cached: true })
    expect(fetch).toHaveBeenCalledTimes(1)
    clock += 3 * 60_000 // expired
    await svc.classify({ requestId: '3', input: 'stopwatch please' })
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
