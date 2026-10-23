import { inferExtraParams } from './actionsExtra.js'
import { parseTimerInput } from './durations.js'
import { normalizeUrl } from './search.js'
import { parseEvent, parseReminder } from './timeparse.js'

const trimTail = (t) => t?.replace(/\s+(?:for|in|to|of|at|on)$/i, '').trim() || undefined

/**
 * Build action params from the raw input once a *classifier* has picked the action.
 * Classifiers choose the tool but cannot extract values, so durations, times and text come
 * from the same deterministic parsers the local tier uses.
 *
 * Returns `null` when the action cannot sensibly run for this input (the intent is dropped).
 */
export function inferParams(actionId, input, { now = new Date(), defaultEventMinutes = 30 } = {}) {
  const text = String(input).trim()
  if (!text) return null
  switch (actionId) {
    case 'timer.start': {
      const t = parseTimerInput(text) ?? parseTimerInput(`timer ${text}`)
      return t ? { durationSeconds: t.seconds, label: trimTail(t.label) } : {}
    }
    case 'reminder.create': {
      const r = parseReminder(text, now) ?? parseReminder(`remind me to ${text}`, now)
      if (!r) return {}
      return {
        text: r.text || undefined,
        remindAt: r.remindAt?.toISOString(),
        repeat: r.repeat ?? undefined
      }
    }
    case 'calendar.create': {
      const opts = { defaultMinutes: defaultEventMinutes }
      const e = parseEvent(text, now, opts) ?? parseEvent(`schedule ${text}`, now, opts)
      return e
        ? { title: e.title || undefined, start: e.start.toISOString(), end: e.end.toISOString() }
        : {}
    }
    case 'note.create':
      return {
        body:
          text.replace(/^(?:note|jot(?:\s+down)?|remember(?:\s+that)?)\b[:\s]*/i, '').trim() || text
      }
    case 'notes.search': {
      const q = text
        .replace(/^(?:search|find)?\s*(?:my\s+)?notes?\b(?:\s+(?:about|for|on))?[:\s]*/i, '')
        .trim()
      return q ? { query: q } : {}
    }
    case 'web.search':
      return { query: text }
    case 'web.openUrl': {
      const url = normalizeUrl(text)
      return url ? { url } : null
    }
    default:
      return inferExtraParams(actionId, text, { now }) // newer actions (weather, tasks, system…)
  }
}
