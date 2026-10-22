import { describe, expect, it } from 'vitest'
import {
  durationPhrase,
  extractDuration,
  formatClock,
  formatDuration,
  formatStopwatch,
  parseTimerInput
} from '../src/shared/durations.js'

describe('parseTimerInput', () => {
  it.each([
    ['25m', 1500],
    ['timer 1h 30m', 5400],
    ['1h30', 5400],
    ['90s', 90],
    ['10 min', 600],
    ['in 2 hours', 7200],
    ['timer 10 min', 600],
    ['countdown 45s', 45],
    ['1.5h', 5400]
  ])('%s -> %i s', (input, seconds) => {
    expect(parseTimerInput(input)?.seconds).toBe(seconds)
  })

  it('extracts a label after an explicit timer keyword', () => {
    expect(parseTimerInput('timer for 5 min pasta')).toEqual({ seconds: 300, label: 'pasta' })
  })

  it('does not treat sentences or bare numbers as timers', () => {
    expect(parseTimerInput('25 apples')).toBeNull()
    expect(parseTimerInput('25')).toBeNull()
    expect(parseTimerInput('call mom in 5m')).toBeNull()
    expect(parseTimerInput('')).toBeNull()
    expect(parseTimerInput('timer')).toBeNull()
  })

  it('rejects absurd durations', () => {
    expect(parseTimerInput('9999h')).toBeNull()
    expect(parseTimerInput('0m')).toBeNull()
  })
})

describe('extractDuration', () => {
  it('returns null seconds and the original text when nothing matches', () => {
    expect(extractDuration('hello')).toEqual({ seconds: null, rest: 'hello' })
  })
  it('removes the matched duration', () => {
    expect(extractDuration('dentist 1 hour')).toEqual({ seconds: 3600, rest: 'dentist' })
  })
})

describe('formatting', () => {
  it('formatDuration / durationPhrase', () => {
    expect(formatDuration(1500)).toBe('25 min')
    expect(formatDuration(5400)).toBe('1 h 30 min')
    expect(formatDuration(45)).toBe('45 sec')
    expect(durationPhrase(1500)).toBe('25-minute')
    expect(durationPhrase(7200)).toBe('2-hour')
    expect(durationPhrase(5400)).toBe('1 h 30 min')
    expect(durationPhrase(30)).toBe('30-second')
  })
  it('formatClock rounds up so a timer never shows 00:00 while still running', () => {
    expect(formatClock(272_000)).toBe('04:32')
    expect(formatClock(3_725_000)).toBe('1:02:05')
    expect(formatClock(1)).toBe('00:01')
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(-5)).toBe('00:00')
  })
  it('formatStopwatch shows centiseconds', () => {
    expect(formatStopwatch(83_450)).toBe('01:23.45')
    expect(formatStopwatch(3_661_000)).toBe('1:01:01.00')
  })
})
