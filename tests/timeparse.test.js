import { describe, expect, it } from 'vitest'
import {
  formatWhen,
  nextRepeat,
  parseEvent,
  parseReminder,
  parseWhen,
  parseWhenOnly
} from '../src/shared/timeparse.js'

// Thursday, 22 Oct 2026, 10:00 local time. Assertions use local fields so they hold in any TZ.
const NOW = new Date(2026, 9, 22, 10, 0, 0)
const hm = (d) => [d.getHours(), d.getMinutes()]
const ymd = (d) => [d.getFullYear(), d.getMonth() + 1, d.getDate()]

describe('parseReminder', () => {
  it('"remind me to call mom tomorrow at 5pm"', () => {
    const r = parseReminder('remind me to call mom tomorrow at 5pm', NOW)
    expect(r.text).toBe('Call mom')
    expect(ymd(r.remindAt)).toEqual([2026, 10, 23])
    expect(hm(r.remindAt)).toEqual([17, 0])
  })

  it('relative time: "remind me to stretch in 30 min"', () => {
    const r = parseReminder('remind me to stretch in 30 min', NOW)
    expect(r.text).toBe('Stretch')
    expect(r.remindAt.getTime() - NOW.getTime()).toBe(30 * 60_000)
  })

  it('time before text: "remind me tomorrow 9am to pay rent"', () => {
    const r = parseReminder('remind me tomorrow 9am to pay rent', NOW)
    expect(r.text).toBe('Pay rent')
    expect(ymd(r.remindAt)).toEqual([2026, 10, 23])
    expect(hm(r.remindAt)).toEqual([9, 0])
  })

  it('date without a time defaults to 9:00', () => {
    const r = parseReminder('remind me to renew passport tomorrow', NOW)
    expect(hm(r.remindAt)).toEqual([9, 0])
  })

  it('assumes pm for ambiguous small hours ("at 5"), but respects explicit am and larger hours', () => {
    expect(hm(parseReminder('remind me to call mom tomorrow at 5', NOW).remindAt)).toEqual([17, 0])
    expect(hm(parseReminder('remind me to call mom tomorrow at 5am', NOW).remindAt)).toEqual([5, 0])
    expect(hm(parseReminder('remind me to call mom tomorrow at 9', NOW).remindAt)).toEqual([9, 0])
    expect(hm(parseReminder('remind me to call mom tomorrow at 17:00', NOW).remindAt)).toEqual([
      17, 0
    ])
  })

  it('detects repeats', () => {
    expect(parseReminder('remind me to take vitamins every day at 8am', NOW).repeat).toBe('daily')
    expect(parseReminder('remind me to review weekly at 4pm', NOW).repeat).toBe('weekly')
  })

  it('returns remindAt null when no time is present, null when not a reminder', () => {
    expect(parseReminder('remind me to buy milk', NOW)).toMatchObject({
      text: 'Buy milk',
      remindAt: null
    })
    expect(parseReminder('buy milk', NOW)).toBeNull()
  })
})

describe('parseEvent', () => {
  it('"dentist friday 3pm 1 hour" (acceptance criterion 4)', () => {
    const e = parseEvent('dentist friday 3pm 1 hour', NOW)
    expect(e.title).toBe('Dentist')
    expect(ymd(e.start)).toEqual([2026, 10, 23])
    expect(hm(e.start)).toEqual([15, 0])
    expect(e.end.getTime() - e.start.getTime()).toBe(3600_000)
  })

  it('defaults to 30 minutes ("lunch with sam thu 1pm")', () => {
    const e = parseEvent('lunch with sam thu 1pm', NOW)
    expect(e.title).toBe('Lunch with sam')
    expect(hm(e.start)).toEqual([13, 0])
    expect(e.end.getTime() - e.start.getTime()).toBe(30 * 60_000)
  })

  it('respects the configured default length and explicit "for" durations', () => {
    expect(
      parseEvent('standup tomorrow 10am', NOW, { defaultMinutes: 15 }).end -
        parseEvent('standup tomorrow 10am', NOW).start
    ).toBe(15 * 60_000)
    const e = parseEvent('review friday 2pm for 90 minutes', NOW)
    expect(e.end.getTime() - e.start.getTime()).toBe(90 * 60_000)
  })

  it('uses time ranges when given', () => {
    const e = parseEvent('book meeting with joe tomorrow 2pm-3pm', NOW)
    expect(e.title).toBe('Meeting with joe')
    expect(hm(e.start)).toEqual([14, 0])
    expect(hm(e.end)).toEqual([15, 0])
  })

  it('explicit keyword without a date still yields a draft', () => {
    const e = parseEvent('schedule standup', NOW)
    expect(e.title).toBe('Standup')
    expect(e.inferred).toBe(true)
  })

  it('does not mistake durations and delays for events', () => {
    for (const q of [
      'cook the pasta for ten minutes',
      'cook pasta for 10 minutes',
      'call mom in 2 hours',
      'nap for an hour'
    ]) {
      expect(parseEvent(q, NOW), q).toBeNull()
    }
    expect(parseEvent('lunch at 1', NOW)?.title).toBe('Lunch')
  })

  it('does not hijack plain sentences or reminders', () => {
    expect(parseEvent('buy milk', NOW)).toBeNull()
    expect(parseEvent('what is tomorrow', NOW)).toBeNull()
    expect(parseEvent('remind me to call mom at 5pm', NOW)).toBeNull()
  })
})

describe('helpers', () => {
  it('parseWhenOnly only accepts pure time phrases', () => {
    expect(parseWhenOnly('in 2 hours', NOW).getTime() - NOW.getTime()).toBe(2 * 3600_000)
    expect(parseWhenOnly('call mom tomorrow', NOW)).toBeNull()
  })
  it('parseWhen finds a time anywhere', () => {
    expect(hm(parseWhen('tomorrow 9am', NOW))).toEqual([9, 0])
    expect(parseWhen('nonsense', NOW)).toBeNull()
  })
  it('nextRepeat advances strictly past `after`', () => {
    const day = 86_400_000
    expect(nextRepeat(0, 'daily', 3 * day + 5)).toBe(4 * day)
    expect(nextRepeat(0, 'weekly', 7 * day)).toBe(14 * day)
  })
  it('formatWhen labels today / tomorrow', () => {
    expect(formatWhen(new Date(2026, 9, 22, 17, 0), NOW)).toMatch(/^Today /)
    expect(formatWhen(new Date(2026, 9, 23, 17, 0), NOW)).toMatch(/^Tomorrow /)
  })
})
