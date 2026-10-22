import { describe, expect, it } from 'vitest'
import {
  ACTIONS,
  AI_ACTION_IDS,
  getAction,
  isEnabled,
  stableStringify
} from '../src/shared/actionRegistry.js'
import { rank } from '../src/shared/ranking.js'
import { DEFAULT_SETTINGS } from '../src/shared/settings.js'
import {
  fullyHandledLocally,
  intentsToSuggestions,
  localSuggestions
} from '../src/shared/suggest.js'

const NOW = new Date(2026, 9, 22, 10, 0, 0)
const ctx = (over = {}) => ({
  now: NOW,
  settings: { ...DEFAULT_SETTINGS, ...over.settings },
  recording: Boolean(over.recording)
})
const top = (q, c = ctx(), max = 7) => rank(localSuggestions(q, c), { max, now: NOW.getTime() })

describe('acceptance criteria (local tier)', () => {
  it('#2: "25m" suggests a 25-minute timer first', () => {
    const [first] = top('25m')
    expect(first).toMatchObject({
      actionId: 'timer.start',
      params: { durationSeconds: 1500 },
      title: 'Start 25-minute timer',
      kind: 'widget'
    })
  })

  it('#3: reminder phrase yields a reminder with parsed time', () => {
    const [first] = top('remind me to call mom tomorrow at 5pm')
    expect(first.actionId).toBe('reminder.create')
    expect(first.params.text).toBe('Call mom')
    const at = new Date(first.params.remindAt)
    expect([at.getDate(), at.getHours(), at.getMinutes()]).toEqual([23, 17, 0])
  })

  it('#4: calendar phrase yields a pre-filled event', () => {
    const [first] = top('dentist friday 3pm 1 hour')
    expect(first.actionId).toBe('calendar.create')
    expect(first.params.title).toBe('Dentist')
    expect(Date.parse(first.params.end) - Date.parse(first.params.start)).toBe(3600_000)
  })

  it('#5: math and conversions give live copyable rows', () => {
    const calc = top('12*(3+4)')[0]
    expect(calc).toMatchObject({ actionId: 'calc.evaluate', title: '= 84', copies: true })
    const conv = top('5 miles in km')[0]
    expect(conv).toMatchObject({ actionId: 'convert.units', title: '= 8.04672 km', copies: true })
  })

  it('#6: "screenshot" offers full / area / window in that order', () => {
    const ids = top('screenshot').map((r) => r.actionId)
    expect(ids.slice(0, 3)).toEqual(['screenshot.full', 'screenshot.area', 'screenshot.window'])
  })

  it('"record screen" offers recording; "stop recording" only while recording', () => {
    expect(top('record screen')[0].actionId).toBe('record.start')
    expect(top('stop recording').some((r) => r.actionId === 'record.stop')).toBe(false)
    const rec = ctx({ recording: true })
    expect(top('stop recording', rec)[0].actionId).toBe('record.stop')
    expect(top('record screen', rec).some((r) => r.actionId === 'record.start')).toBe(false)
  })
})

describe('local suggestions', () => {
  it('always ends with a web-search fallback, and has nothing for empty input', () => {
    expect(localSuggestions('', ctx())).toEqual([])
    const rows = top('xyzzy plugh')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ actionId: 'web.search', params: { query: 'xyzzy plugh' } })
  })

  it('search prefixes pick the engine; URLs and paths become open rows', () => {
    expect(top('yt lofi')[0]).toMatchObject({
      actionId: 'web.search',
      params: { query: 'lofi', engine: 'youtube' }
    })
    expect(top('https://example.com')[0]).toMatchObject({ actionId: 'web.openUrl' })
    expect(top('~/Documents')[0]).toMatchObject({
      actionId: 'file.open',
      params: { path: '~/Documents' }
    })
  })

  it('note shortcuts prefill the body', () => {
    expect(top('n: buy milk')[0]).toMatchObject({
      actionId: 'note.create',
      params: { body: 'buy milk' }
    })
    expect(top('remember that the code is 1234')[0]).toMatchObject({ actionId: 'note.create' })
  })

  it('fuzzy matching handles typos and partial command names', () => {
    expect(top('stopw')[0].actionId).toBe('stopwatch.start')
    expect(top('timr')[0].actionId).toBe('timer.start')
  })

  it('a bare "in 2 hours" offers both a timer and a reminder', () => {
    const ids = top('in 2 hours').map((r) => r.actionId)
    expect(ids).toContain('timer.start')
    expect(ids).toContain('reminder.create')
  })

  it('respects disabled actions', () => {
    const c = ctx({ settings: { disabledActions: ['timer.start'] } })
    expect(top('25m', c).some((r) => r.actionId === 'timer.start')).toBe(false)
  })

  it('never throws on hostile input', () => {
    for (const q of [
      '(((',
      '1/0',
      '\u0000',
      'a'.repeat(5000),
      '%$#@!',
      'in',
      'open',
      'file',
      'launch',
      'url',
      'convert',
      'calc',
      'remind',
      'timer',
      '9'.repeat(400) + 'm'
    ]) {
      expect(() => localSuggestions(q, ctx())).not.toThrow()
    }
  })

  it('completes in well under the 20 ms tier-1 budget', () => {
    localSuggestions('warm up', ctx())
    const t = performance.now()
    for (let i = 0; i < 20; i++) localSuggestions('dentist friday 3pm 1 hour', ctx())
    expect((performance.now() - t) / 20).toBeLessThan(20)
  })
})

describe('AI merge helpers', () => {
  it('fullyHandledLocally is true only for high-confidence parser hits', () => {
    expect(fullyHandledLocally(localSuggestions('25m', ctx()))).toBe(true)
    expect(fullyHandledLocally(localSuggestions('12*(3+4)', ctx()))).toBe(true)
    expect(fullyHandledLocally(localSuggestions('dentist friday 3pm', ctx()))).toBe(false)
    expect(fullyHandledLocally(localSuggestions('hello', ctx()))).toBe(false)
  })

  it('intentsToSuggestions builds ai rows and skips disabled actions', () => {
    const intents = [
      {
        actionId: 'timer.start',
        confidence: 0.9,
        params: { durationSeconds: 600 },
        title: 'AI timer'
      },
      { actionId: 'stopwatch.start', confidence: 0.4, params: {} }
    ]
    const rows = intentsToSuggestions(
      intents,
      ctx({ settings: { disabledActions: ['stopwatch.start'] } })
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ source: 'ai', aiConfidence: 0.9, title: 'AI timer' })
  })

  it('merging AI + local de-duplicates identical actions', () => {
    const local = localSuggestions('25m', ctx())
    const ai = intentsToSuggestions(
      [{ actionId: 'timer.start', confidence: 0.95, params: { durationSeconds: 1500 } }],
      ctx()
    )
    const merged = rank([...local, ...ai])
    expect(merged.filter((r) => r.actionId === 'timer.start')).toHaveLength(1)
    expect(merged[0].aiConfidence).toBe(0.95)
  })
})

describe('registry integrity', () => {
  it('ids are unique and every action is fully described', () => {
    expect(new Set(ACTIONS.map((a) => a.id)).size).toBe(ACTIONS.length)
    for (const a of ACTIONS) {
      expect(['instant', 'widget']).toContain(a.kind)
      expect(typeof a.paramsSchema).toBe('function')
      expect(typeof a.describe).toBe('function')
      expect(a.keywords.length).toBeGreaterThan(0)
    }
  })
  it('AI may not request local-state actions', () => {
    for (const id of ['record.stop', 'calc.evaluate', 'convert.units', 'file.open', 'app.open'])
      expect(AI_ACTION_IDS).not.toContain(id)
  })
  it('stableStringify is key-order independent', () => {
    expect(stableStringify({ b: 1, a: [2, { d: 1, c: undefined }] })).toBe(
      stableStringify({ a: [2, { d: 1 }], b: 1 })
    )
  })
  it('isEnabled gates recording actions on state', () => {
    expect(isEnabled(getAction('record.stop'), DEFAULT_SETTINGS, { recording: false })).toBe(false)
    expect(isEnabled(getAction('record.start'), DEFAULT_SETTINGS, { recording: true })).toBe(false)
  })
})

describe('fuzzy strictness', () => {
  it('short queries do not match loosely ("sig" ≠ "session")', () => {
    const ids = top('sig').map((r) => r.actionId)
    expect(ids).not.toContain('pomodoro.start')
  })
  it('new actions are reachable', () => {
    expect(top('pomodoro')[0].actionId).toBe('pomodoro.start')
    expect(top('agenda')[0]).toMatchObject({
      actionId: 'calendar.agenda',
      params: { day: 'today' }
    })
    expect(top("tomorrow's schedule")[0]).toMatchObject({
      actionId: 'calendar.agenda',
      params: { day: 'tomorrow' }
    })
    expect(top('clipboard')[0].actionId).toBe('clipboard.history')
    expect(top('; sig')[0]).toMatchObject({ actionId: 'snippets.open', params: { query: 'sig' } })
    expect(top('snippets')[0].actionId).toBe('snippets.open')
  })
  it('currency conversions parse locally and outrank the web fallback', () => {
    const [first] = top('100 usd to eur')
    expect(first).toMatchObject({
      actionId: 'currency.convert',
      params: { amount: 100, from: 'USD', to: 'EUR' },
      copies: true
    })
  })
  it('rows can be overridden by live results (same key) without duplicating', () => {
    const local = localSuggestions('100 usd to eur', ctx()).find(
      (r) => r.actionId === 'currency.convert'
    )
    const live = { ...local, override: true, title: '= 89.25 EUR', source: 'rates' }
    const merged = rank([local, live])
    expect(merged.filter((r) => r.actionId === 'currency.convert')).toHaveLength(1)
    expect(merged.find((r) => r.actionId === 'currency.convert').title).toBe('= 89.25 EUR')
  })
  it('learned choices lift the usual action for that input shape', () => {
    const rows = localSuggestions('note milk', ctx()).map((r) => ({
      ...r,
      learned: r.actionId === 'notes.search' ? 1 : 0
    }))
    const plain = rank(localSuggestions('note milk', ctx())).map((r) => r.actionId)
    const learned = rank(rows).map((r) => r.actionId)
    expect(learned.indexOf('notes.search')).toBeLessThanOrEqual(plain.indexOf('notes.search'))
  })
})
