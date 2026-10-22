import { describe, expect, it } from 'vitest'
import { AI_ACTION_IDS } from '../src/shared/actionRegistry.js'
import { extractJson, validateIntents } from '../src/shared/intents.js'

const good = {
  intents: [
    {
      actionId: 'timer.start',
      confidence: 0.93,
      params: { durationSeconds: 1500, label: 'Focus' },
      title: 'Start 25-minute timer',
      subtitle: 'Label: Focus'
    }
  ]
}

describe('extractJson', () => {
  it('parses plain, fenced and prose-wrapped JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 })
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(extractJson('Sure! {"a":1} hope that helps')).toEqual({ a: 1 })
  })
  it('returns null for garbage', () => {
    expect(extractJson('nope')).toBeNull()
    expect(extractJson('{broken')).toBeNull()
    expect(extractJson(undefined)).toBeNull()
  })
})

describe('validateIntents', () => {
  it('accepts a valid intent (schema example from the spec)', () => {
    const r = validateIntents(good, { allowedIds: AI_ACTION_IDS })
    expect(r.intents).toHaveLength(1)
    expect(r.intents[0]).toMatchObject({
      actionId: 'timer.start',
      confidence: 0.93,
      params: { durationSeconds: 1500, label: 'Focus' }
    })
  })

  it('accepts a JSON string', () => {
    expect(validateIntents(JSON.stringify(good)).intents).toHaveLength(1)
  })

  it('drops unknown or disallowed action ids', () => {
    const r = validateIntents(
      {
        intents: [
          { actionId: 'rm.rf', confidence: 1, params: {} },
          { actionId: 'record.stop', confidence: 1, params: {} }
        ]
      },
      { allowedIds: AI_ACTION_IDS }
    )
    expect(r.intents).toEqual([])
    expect(r.dropped).toBe(2)
  })

  it('validates params per action and strips unknown keys', () => {
    const r = validateIntents({
      intents: [
        { actionId: 'timer.start', confidence: 1, params: { durationSeconds: -5 } },
        {
          actionId: 'timer.start',
          confidence: 1,
          params: { durationSeconds: 60, evil: '<script>' }
        },
        {
          actionId: 'reminder.create',
          confidence: 1,
          params: { text: 'x', remindAt: 'not-a-date' }
        },
        { actionId: 'web.openUrl', confidence: 1, params: { url: 42 } }
      ]
    })
    expect(r.intents).toHaveLength(1)
    expect(r.intents[0].params).toEqual({ durationSeconds: 60 })
  })

  it('clamps confidence and tolerates missing values', () => {
    const r = validateIntents({
      intents: [
        { actionId: 'stopwatch.start', confidence: 7, params: {} },
        { actionId: 'stopwatch.start', params: {} }
      ]
    })
    expect(r.intents.map((i) => i.confidence)).toEqual([1, 0.5])
  })

  it('keeps at most 4 intents', () => {
    const intents = Array.from({ length: 9 }, () => ({
      actionId: 'stopwatch.start',
      confidence: 0.5,
      params: {}
    }))
    expect(validateIntents({ intents }).intents).toHaveLength(4)
  })

  it('flags malformed responses', () => {
    expect(validateIntents('not json').malformed).toBe(true)
    expect(validateIntents({ foo: 1 }).malformed).toBe(true)
    expect(validateIntents({ intents: [] })).toMatchObject({ intents: [], malformed: false })
  })

  it('truncates long titles (no unbounded model text in the UI)', () => {
    const r = validateIntents({
      intents: [{ actionId: 'stopwatch.start', confidence: 1, params: {}, title: 'x'.repeat(500) }]
    })
    expect(r.intents[0].title).toHaveLength(120)
  })
})
