import { describe, expect, it } from 'vitest'
import { convertCurrency, formatMoney, parseCurrency } from '../src/shared/currency.js'
import { parseEventEdit, parseReminderEdit, parseTimerEdit } from '../src/shared/editParse.js'
import { inputShape, learnedBoost } from '../src/shared/inputShape.js'

const NOW = new Date(2026, 9, 22, 10, 0, 0)

describe('parseCurrency', () => {
  it.each([
    ['100 usd to eur', { amount: 100, from: 'USD', to: 'EUR' }],
    ['$50 in inr', { amount: 50, from: 'USD', to: 'INR' }],
    ['50 euros to dollars', { amount: 50, from: 'EUR', to: 'USD' }],
    ['€20 to gbp', { amount: 20, from: 'EUR', to: 'GBP' }],
    ['usd to jpy', { amount: 1, from: 'USD', to: 'JPY' }],
    ['1,250.50 gbp -> cad', { amount: 1250.5, from: 'GBP', to: 'CAD' }]
  ])('%s', (input, expected) => expect(parseCurrency(input)).toEqual(expected))

  it('never claims unit conversions or nonsense', () => {
    for (const q of [
      '5 cups to ml',
      '100 f to c',
      '5 miles in km',
      '10 in to cm',
      'usd to usd',
      '100 foo to bar',
      'hello',
      '3 try in 4'
    ]) {
      expect(parseCurrency(q), q).toBeNull()
    }
  })
})

describe('convertCurrency', () => {
  const rates = { USD: 1.1, INR: 106, GBP: 0.84 }
  it('crosses through EUR', () => {
    expect(convertCurrency(100, 'EUR', 'USD', rates).value).toBeCloseTo(110)
    expect(convertCurrency(110, 'USD', 'EUR', rates).value).toBeCloseTo(100)
    expect(convertCurrency(1, 'USD', 'INR', rates).value).toBeCloseTo(106 / 1.1)
  })
  it('returns null for unknown currencies; formats money', () => {
    expect(convertCurrency(1, 'USD', 'ZAR', rates)).toBeNull()
    expect(formatMoney(1234.5, 'EUR')).toBe('1,234.50 EUR')
    expect(formatMoney(1234.5, 'JPY')).toBe('1,235 JPY')
  })
})

describe('inputShape', () => {
  it('keeps only a coarse shape, never the full text', () => {
    expect(inputShape('remind me to call mom at 5pm')).toBe('remind me')
    expect(inputShape('25m')).toBe('#m')
    expect(inputShape('Dentist Friday 3pm 1 hour')).toBe('dentist friday')
    expect(inputShape('   ')).toBe('')
    expect(inputShape('x'.repeat(100)).length).toBeLessThanOrEqual(24)
  })
  it('boost grows slowly and saturates at 1', () => {
    expect(learnedBoost(0)).toBe(0)
    expect(learnedBoost(1)).toBeGreaterThan(0)
    expect(learnedBoost(3)).toBeGreaterThan(learnedBoost(1))
    expect(learnedBoost(10_000)).toBe(1)
  })
})

describe('parseTimerEdit', () => {
  it.each([
    ['make it 30 minutes', { op: 'set', ms: 1_800_000 }],
    ['30m', { op: 'set', ms: 1_800_000 }],
    ['set to 1h', { op: 'set', ms: 3_600_000 }],
    ['add 5 minutes', { op: 'add', ms: 300_000 }],
    ['+5m', { op: 'add', ms: 300_000 }],
    ['5 min more', { op: 'add', ms: 300_000 }],
    ['pasta', { op: 'rename', label: 'pasta' }]
  ])('%s', (input, expected) => expect(parseTimerEdit(input)).toEqual(expected))
  it('ignores empty input', () => expect(parseTimerEdit('  ')).toBeNull())
})

describe('parseReminderEdit', () => {
  it('moves the time and/or changes the repeat', () => {
    const r = parseReminderEdit('tomorrow 9am', NOW)
    expect([r.remindAt.getDate(), r.remindAt.getHours()]).toEqual([23, 9])
    expect(parseReminderEdit('make it daily', NOW)).toEqual({ repeat: 'daily' })
    expect(parseReminderEdit("don't repeat", NOW)).toEqual({ repeat: 'none' })
    expect(parseReminderEdit('blah', NOW)).toBeNull()
  })
})

describe('parseEventEdit', () => {
  const cur = { start: new Date(2026, 9, 23, 15, 0), end: new Date(2026, 9, 23, 16, 0) }
  const hm = (d) => [d.getHours(), d.getMinutes()]
  it('changes only what was said', () => {
    const t = parseEventEdit('4pm', cur, NOW)
    expect(hm(t.start)).toEqual([16, 0])
    expect(t.end - t.start).toBe(3_600_000) // length kept
    expect(t.start.getDate()).toBe(23) // date kept
  })
  it('handles dates, lengths and ambiguous hours', () => {
    expect(parseEventEdit('for 90 minutes', cur, NOW).end - cur.start).toBe(90 * 60_000)
    const d = parseEventEdit(
      'tomorrow 2pm',
      { ...cur, start: new Date(2026, 9, 23, 15), end: new Date(2026, 9, 23, 16) },
      NOW
    )
    expect(hm(d.start)).toEqual([14, 0])
    expect(parseEventEdit('at 5', cur, NOW).start.getHours()).toBe(17)
    expect(parseEventEdit('30 minutes', cur, NOW).end - cur.start).toBe(30 * 60_000)
  })
  it('returns null when nothing changes', () => {
    expect(parseEventEdit('nonsense words', cur, NOW)).toBeNull()
    expect(parseEventEdit('', cur, NOW)).toBeNull()
  })
})
