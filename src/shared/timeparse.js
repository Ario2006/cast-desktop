import { en as chrono } from 'chrono-node'
import { extractDuration } from './durations.js'

const DAY_MS = 86_400_000
const REPEAT_RE = /\b(?:every\s+day|daily|every\s+week|weekly)\b/i

/** Remove the character range of a chrono result from text. */
function cutResult(text, result) {
  return (text.slice(0, result.index) + ' ' + text.slice(result.index + result.text.length))
    .replace(/\s+/g, ' ')
    .trim()
}

const trimConnectors = (t) =>
  t
    .replace(/^(?:to|that|about|at|on|in|by|for|-|,|:)\s+/i, '')
    .replace(/\s+(?:to|that|about|at|on|in|by|for|and|-|,)$/i, '')
    .replace(/^(?:to)\s+/i, '')
    .trim()

const capitalize = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t)

function dateOf(result, defaultHour = 9) {
  const d = result.start.date()
  if (!result.start.isCertain('hour')) d.setHours(defaultHour, 0, 0, 0)
  return d
}

/** Pick the most informative chrono result: prefer ones with a certain time of day. */
function pickResult(results) {
  if (!results.length) return null
  return results.find((r) => r.start.isCertain('hour')) ?? results[0]
}

/**
 * "remind me to call mom tomorrow at 5pm" -> { text: 'Call mom', remindAt: Date, repeat }
 * Returns null if the input is not a reminder phrase. `remindAt` is null when no time was found.
 */
export function parseReminder(input, now = new Date()) {
  const m = String(input)
    .trim()
    .match(/^(?:remind\s+me|reminder|remind)\b\s*(?:to\s+|about\s+|that\s+)?(.*)$/i)
  if (!m) return null
  let rest = m[1].trim()
  let repeat = null
  const rep = rest.match(REPEAT_RE)
  if (rep) {
    repeat = /week/i.test(rep[0]) ? 'weekly' : 'daily'
    rest = rest.replace(REPEAT_RE, ' ').replace(/\s+/g, ' ').trim()
  }
  const result = pickResult(chrono.parse(rest, now, { forwardDate: true }))
  if (!result) return { text: capitalize(trimConnectors(rest)), remindAt: null, repeat }
  const remindAt = dateOf(result)
  const text = capitalize(trimConnectors(cutResult(rest, result)))
  return { text, remindAt, repeat }
}

/** Free-form "when" field ("tomorrow 9am", "in 20 min") -> Date | null. */
export function parseWhen(text, now = new Date()) {
  const r = pickResult(chrono.parse(String(text), now, { forwardDate: true }))
  return r ? dateOf(r) : null
}

/** A bare time phrase with no leading verb: "in 2 hours", "tomorrow 9am". */
export function parseWhenOnly(input, now = new Date()) {
  const text = String(input).trim()
  const results = chrono.parse(text, now, { forwardDate: true })
  const r = results[0]
  if (!r || cutResult(text, r) !== '') return null
  return dateOf(r)
}

const EVENT_KEYWORD =
  /^(?:(?:book|schedule|add|create|set\s*up|new)\s+(?:an?\s+)?)?(?:(?:calendar\s+)?(event|meeting|appointment))?\s*/i

/**
 * "dentist friday 3pm for 1 hour" -> { title: 'Dentist', start, end }
 * `strict` (explicit keyword) vs heuristic: heuristic mode requires a date AND a time of day
 * plus leftover text, so plain sentences don't turn into calendar suggestions.
 */
export function parseEvent(input, now = new Date(), { defaultMinutes = 30 } = {}) {
  const raw = String(input).trim()
  const kw = raw.match(
    /^(?:(?:book|schedule|add|create|set\s*up|new)\b|(?:calendar\s+)?(?:event|meeting|appointment)\b)/i
  )
  const explicit = Boolean(kw)
  let body = raw
  if (explicit) {
    const noun = raw.match(EVENT_KEYWORD)?.[1]
    body = raw.replace(EVENT_KEYWORD, '').trim()
    // "book meeting with joe" -> keep the noun when the remainder only qualifies it
    if (noun && /^(?:with|about|re:|regarding)\b/i.test(body)) body = `${noun} ${body}`
  }
  if (/^remind/i.test(body)) return null

  let durationSeconds = null
  const forDur = body.match(/\bfor\s+((?:\d+(?:\.\d+)?\s*(?:hours?|hrs?|h|minutes?|mins?|m)\s*)+)/i)
  if (forDur) {
    durationSeconds = extractDuration(forDur[1]).seconds
    body = body.replace(forDur[0], ' ').replace(/\s+/g, ' ').trim()
  }

  const results = chrono.parse(body, now, { forwardDate: true })
  const result = pickResult(results)
  if (!result) {
    if (!explicit) return null
    const start = new Date(now)
    start.setMinutes(0, 0, 0)
    start.setHours(start.getHours() + 1)
    const title = capitalize(trimConnectors(body))
    return {
      title,
      start,
      end: new Date(start.getTime() + (durationSeconds ?? defaultMinutes * 60) * 1000),
      inferred: true
    }
  }
  if (!explicit && !result.start.isCertain('hour')) return null

  let leftover = cutResult(body, result)
  if (durationSeconds == null) {
    const d = extractDuration(leftover)
    if (d.seconds) {
      durationSeconds = d.seconds
      leftover = d.rest
    }
  }
  const title = capitalize(trimConnectors(leftover))
  if (!explicit && title.length < 2) return null

  const start = dateOf(result)
  let end
  if (result.end) end = result.end.date()
  else end = new Date(start.getTime() + (durationSeconds ?? defaultMinutes * 60) * 1000)
  if (end <= start) end = new Date(start.getTime() + defaultMinutes * 60_000)
  return { title, start, end, inferred: false }
}

/** Next occurrence of a repeating reminder strictly after `after`. */
export function nextRepeat(remindAtMs, repeat, afterMs) {
  const step = repeat === 'weekly' ? 7 * DAY_MS : DAY_MS
  let t = remindAtMs
  while (t <= afterMs) t += step
  return t
}

const fmtDay = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric'
})
const fmtTime = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

/** "Today 5:00 PM", "Tomorrow 9:00 AM", "Fri, Oct 24 3:00 PM" */
export function formatWhen(date, now = new Date()) {
  const d = new Date(date)
  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDays = Math.round((startOfDay(d) - startOfDay(now)) / DAY_MS)
  const day = diffDays === 0 ? 'Today' : diffDays === 1 ? 'Tomorrow' : fmtDay.format(d)
  return `${day} ${fmtTime.format(d)}`
}
