import * as chrono from 'chrono-node'
import { extractDuration, parseTimerInput } from './durations.js'
import { parseWhen } from './timeparse.js'

const REPEAT_RE = /\b(?:every\s+day|daily|every\s+week|weekly)\b/i
const NO_REPEAT_RE = /\b(?:stop\s+repeating|don'?t\s+repeat|no\s+repeat|once)\b/i

/**
 * Natural-language edits for a running timer.
 *   "make it 30 minutes" / "30m" / "set to 1h"  -> { op: 'set', ms }
 *   "add 5 minutes" / "+5m" / "5 more minutes"   -> { op: 'add', ms }
 *   anything else                                -> { op: 'rename', label }
 */
export function parseTimerEdit(text) {
  const t = String(text).trim()
  if (!t) return null
  const add = t.match(/^(?:add|plus|\+)\s*(.+)$/i) ?? t.match(/^(.+?)\s+more$/i)
  if (add) {
    const d = extractDuration(add[1])
    if (d.seconds && d.rest === '') return { op: 'add', ms: d.seconds * 1000 }
  }
  const set = t.match(
    /^(?:make it|set(?: it)?(?: to)?|change(?: it)?(?: to)?|restart(?: with)?)\s+(.+)$/i
  )
  const direct = parseTimerInput(set ? set[1] : t)
  if (direct && !direct.label) return { op: 'set', ms: direct.seconds * 1000 }
  const d = extractDuration(set ? set[1] : t)
  if (set && d.seconds && d.rest === '') return { op: 'set', ms: d.seconds * 1000 }
  return { op: 'rename', label: t.slice(0, 80) }
}

/** "tomorrow 9am", "in 2 hours", "make it daily" -> { remindAt?: Date, repeat?: 'daily'|'weekly'|'none' } | null */
export function parseReminderEdit(text, now = new Date()) {
  const t = String(text).trim()
  const out = {}
  if (NO_REPEAT_RE.test(t)) out.repeat = 'none'
  const rep = t.match(REPEAT_RE)
  if (rep) out.repeat = /week/i.test(rep[0]) ? 'weekly' : 'daily'
  const when = parseWhen(t.replace(REPEAT_RE, ' '), now)
  if (when) out.remindAt = when
  return Object.keys(out).length ? out : null
}

/**
 * Adjust an event draft: "4pm", "move to friday", "tomorrow 2pm", "for 90 minutes".
 * Unspecified parts (date, time, length) are kept.  Returns { start: Date, end: Date } | null.
 */
export function parseEventEdit(text, current) {
  const t = String(text).trim()
  if (!t) return null
  const keepMs = current.end - current.start
  const forDur = t.match(/\bfor\s+(.+)$/i)
  const dur = extractDuration(forDur ? forDur[1] : t)
  const body = forDur ? t.slice(0, forDur.index) : dur.seconds && dur.rest === '' ? '' : t

  let start = new Date(current.start)
  let touched = false
  const r = body.trim() ? chrono.parse(body, current.start, { forwardDate: true })[0] : null
  if (r) {
    const k = r.start
    if (k.isCertain('day') || k.isCertain('weekday') || k.isCertain('month')) {
      const d = k.date()
      start.setFullYear(d.getFullYear(), d.getMonth(), d.getDate())
      touched = true
    }
    if (k.isCertain('hour')) {
      const d = k.date()
      let h = d.getHours()
      if (!k.isCertain('meridiem') && h >= 1 && h <= 6) h += 12
      start.setHours(h, d.getMinutes(), 0, 0)
      touched = true
    }
  }
  const seconds = dur.seconds && (forDur || dur.rest === '') ? dur.seconds : null
  if (!touched && seconds == null) return null
  const end = new Date(start.getTime() + (seconds != null ? seconds * 1000 : keepMs))
  return { start, end }
}
