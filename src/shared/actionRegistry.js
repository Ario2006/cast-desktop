import * as s from './validate.js'
import { EXTRA_ACTIONS } from './actionsExtra.js'
import { evaluateMath, convertUnits } from './calc.js'
import { formatMoney, parseCurrency } from './currency.js'
import { durationPhrase, formatDuration, parseTimerInput } from './durations.js'
import {
  buildSearchUrl,
  engineName,
  looksLikePath,
  normalizeUrl,
  parseSearchPrefix
} from './search.js'
import { formatWhen, parseEvent, parseReminder, parseWhenOnly } from './timeparse.js'

/**
 * Action registry — the single list of things Cast can do.
 *
 *  id            stable identifier (also what the AI is allowed to return)
 *  kind          'instant' (run + hide) | 'widget' (opens a panel inside the launcher)
 *  paramsSchema  validator for params (IPC input and AI output)
 *  parse(input, ctx) -> { params, confidence } | null     optional local parser
 *  describe(params, ctx) -> { title, subtitle }           row text for a given param set
 *  copies        true when Enter copies a result to the clipboard
 *  aiHint        one-line description the AI classifier sees for this action (omit to hide it from AI)
 *
 * ctx: { now: Date, settings, recording: boolean }
 */

const optStr = (max) => s.opt(s.str(max))

const oneLine = (t = '', max = 60) => (t.length > max ? `${t.slice(0, max - 1)}…` : t)

export const ACTIONS = [
  {
    id: 'timer.start',
    aiHint: "Start a countdown timer for some length of time, e.g. '25 minutes' or 'pasta timer'.",
    title: 'Start timer',
    description: 'Countdown timer that keeps running in the background',
    keywords: ['timer', 'countdown', 'remind in', 'alarm'],
    aliases: ['set timer', 'start timer'],
    icon: 'timer',
    kind: 'widget',
    priority: 90,
    paramsSchema: s.obj({
      durationSeconds: s.opt(s.int(1, 99 * 3600)),
      label: optStr(80),
      timerId: s.opt(s.int(1))
    }),
    parse(input) {
      const r = parseTimerInput(input)
      return r ? { params: { durationSeconds: r.seconds, label: r.label }, confidence: 0.98 } : null
    },
    describe(p) {
      if (p.timerId) return { title: 'Running timer', subtitle: p.label ?? '' }
      if (!p.durationSeconds) return { title: 'Start timer', subtitle: 'Pick a duration' }
      return {
        title: `Start ${durationPhrase(p.durationSeconds)} timer`,
        subtitle: p.label ? `Label: ${p.label}` : 'Countdown with notification'
      }
    }
  },
  {
    id: 'stopwatch.start',
    aiHint: 'Start a stopwatch to count up or time laps.',
    title: 'Stopwatch',
    description: 'Start / lap / pause a stopwatch',
    keywords: ['stopwatch', 'lap', 'elapsed', 'chrono'],
    aliases: ['start stopwatch'],
    icon: 'stopwatch',
    kind: 'widget',
    priority: 80,
    paramsSchema: s.obj({ timerId: s.opt(s.int(1)), label: optStr(80) }),
    describe: (p) => ({
      title: p.timerId ? 'Running stopwatch' : 'Start stopwatch',
      subtitle: p.label ?? 'Count up with laps'
    })
  },
  {
    id: 'calendar.create',
    aiHint:
      'Book, schedule or add a calendar event, meeting or appointment at a particular date and time.',
    title: 'New calendar event',
    description: 'Create a Google Calendar event',
    keywords: ['book', 'schedule', 'meeting', 'appointment', 'event', 'calendar'],
    aliases: ['add event', 'book meeting'],
    icon: 'calendar',
    kind: 'widget',
    priority: 85,
    paramsSchema: s.obj({
      title: optStr(200),
      start: s.opt(s.isoDate),
      end: s.opt(s.isoDate),
      durationMinutes: s.opt(s.int(1, 1440)),
      location: optStr(300),
      description: optStr(2000),
      attendees: s.opt(s.arr(s.str(200), 20)),
      calendarId: optStr(300),
      addMeetLink: s.opt(s.bool),
      recurrence: s.opt(s.str(200)),
      recurrenceLabel: s.opt(s.str(80))
    }),
    parse(input, ctx) {
      const r = parseEvent(input, ctx.now, { defaultMinutes: ctx.settings.defaultEventMinutes })
      if (!r) return null
      return {
        params: {
          title: r.title,
          start: r.start.toISOString(),
          end: r.end.toISOString(),
          ...(r.recurrence ? { recurrence: r.recurrence, recurrenceLabel: r.recurrenceLabel } : {})
        },
        confidence: r.inferred ? 0.55 : 0.82
      }
    },
    describe(p, ctx) {
      if (!p.start) return { title: 'New calendar event', subtitle: p.title ?? 'Google Calendar' }
      const mins = p.end
        ? Math.round((Date.parse(p.end) - Date.parse(p.start)) / 60000)
        : p.durationMinutes
      return {
        title: `Book "${oneLine(p.title || 'Untitled', 40)}"`,
        subtitle: `${p.recurrenceLabel ? `${p.recurrenceLabel[0].toUpperCase()}${p.recurrenceLabel.slice(1)} from ` : ''}${formatWhen(p.start, ctx.now)}${mins ? ` · ${formatDuration(mins * 60)}` : ''}`
      }
    }
  },
  {
    id: 'screenshot.full',
    aiHint: 'Take a screenshot of the whole screen.',
    title: 'Screenshot: full screen',
    keywords: ['screenshot', 'capture screen', 'snap', 'screen grab'],
    aliases: ['capture full screen'],
    icon: 'screenshot',
    kind: 'instant',
    priority: 72,
    paramsSchema: s.obj({}),
    describe: () => ({
      title: 'Screenshot: full screen',
      subtitle: 'Save to your screenshot folder'
    })
  },
  {
    id: 'screenshot.area',
    aiHint: 'Take a screenshot of a selected region or part of the screen.',
    title: 'Screenshot: selected area',
    keywords: ['screenshot', 'capture area', 'snap', 'region', 'selection'],
    aliases: ['capture selection'],
    icon: 'screenshot-area',
    kind: 'instant',
    priority: 71,
    paramsSchema: s.obj({}),
    describe: () => ({ title: 'Screenshot: selected area', subtitle: 'Drag to select a region' })
  },
  {
    id: 'screenshot.window',
    aiHint: 'Take a screenshot of a single application window.',
    title: 'Screenshot: window',
    keywords: ['screenshot', 'capture window', 'snap'],
    aliases: ['capture window'],
    icon: 'screenshot-window',
    kind: 'instant',
    priority: 70,
    paramsSchema: s.obj({}),
    describe: () => ({ title: 'Screenshot: window', subtitle: 'Click a window to capture it' })
  },
  {
    id: 'record.start',
    aiHint: 'Record the screen as a video (screen recording).',
    title: 'Record screen',
    description: 'Record the display to a video file',
    keywords: ['record screen', 'screen recording', 'capture video', 'record', 'screencast'],
    aliases: ['start recording'],
    icon: 'record',
    kind: 'instant',
    priority: 68,
    paramsSchema: s.obj({ audio: s.opt(s.bool) }),
    describe: (p) => ({
      title: p.audio ? 'Record screen with microphone' : 'Record screen',
      subtitle: 'Stop from the menu bar or ⌥⇧Space'
    })
  },
  {
    id: 'record.stop',
    title: 'Stop recording',
    keywords: ['stop recording', 'stop record', 'end recording'],
    aliases: [],
    icon: 'stop',
    kind: 'instant',
    priority: 99,
    paramsSchema: s.obj({}),
    describe: () => ({ title: 'Stop recording', subtitle: 'Finish and save the video' })
  },
  {
    id: 'note.create',
    aiHint: 'Jot down or save a note, or remember a piece of text for later.',
    title: 'New note',
    description: 'Jot something down',
    keywords: ['note', 'jot', 'remember that', 'memo', 'write down'],
    aliases: ['quick note', 'n:'],
    icon: 'note',
    kind: 'widget',
    priority: 75,
    paramsSchema: s.obj({ title: optStr(200), body: optStr(20000), noteId: s.opt(s.int(1)) }),
    parse(input) {
      const m = String(input).match(
        /^(?:n:\s*|(?:note|jot)(?:\s+down)?\b[:\s]+|remember\s+that\s+)(.+)$/is
      )
      return m ? { params: { body: m[1].trim() }, confidence: 0.95 } : null
    },
    describe: (p) => ({
      title: p.body ? `Save note: ${oneLine(p.body.split('\n')[0], 50)}` : 'New note',
      subtitle: 'Opens the note editor · ⌘↵ saves'
    })
  },
  {
    id: 'notes.search',
    aiHint: "Find or search through the user's saved notes.",
    title: 'Search notes',
    keywords: ['search notes', 'find note', 'notes'],
    aliases: ['find notes'],
    icon: 'note-search',
    kind: 'widget',
    priority: 60,
    paramsSchema: s.obj({ query: optStr(200) }),
    parse(input) {
      const m = String(input).match(/^(?:(?:search|find)\s+notes?|notes)\s*[:\s]\s*(.+)$/i)
      return m ? { params: { query: m[1].trim() }, confidence: 0.9 } : null
    },
    describe: (p) => ({
      title: p.query ? `Search notes for "${oneLine(p.query, 40)}"` : 'Search notes',
      subtitle: 'Full-text search'
    })
  },
  {
    id: 'reminder.create',
    aiHint: 'Remind the user to do something at a certain time or after a delay.',
    title: 'New reminder',
    description: 'Get a notification at a set time',
    keywords: ['remind me', 'reminder', 'remind', 'alert me'],
    aliases: ['set reminder'],
    icon: 'bell',
    kind: 'widget',
    priority: 88,
    paramsSchema: s.obj({
      text: optStr(500),
      remindAt: s.opt(s.isoDate),
      repeat: s.opt(s.oneOf('none', 'daily', 'weekly')),
      reminderId: s.opt(s.int(1))
    }),
    parse(input, ctx) {
      const r = parseReminder(input, ctx.now)
      if (r) {
        return {
          params: {
            text: r.text || undefined,
            remindAt: r.remindAt?.toISOString(),
            repeat: r.repeat ?? undefined
          },
          confidence: r.remindAt && r.text ? 0.97 : 0.9
        }
      }
      // "in 2 hours" / "tomorrow 9am" -> offer a reminder alongside the timer
      const when = parseWhenOnly(input, ctx.now)
      return when ? { params: { remindAt: when.toISOString() }, confidence: 0.6 } : null
    },
    describe(p, ctx) {
      if (!p.remindAt)
        return {
          title: p.text ? `Remind me: ${oneLine(p.text, 45)}` : 'New reminder',
          subtitle: 'Choose a time'
        }
      return {
        title: p.text ? `Remind me: ${oneLine(p.text, 45)}` : 'Remind me…',
        subtitle: `${formatWhen(p.remindAt, ctx.now)}${p.repeat && p.repeat !== 'none' ? ` · repeats ${p.repeat}` : ''}`
      }
    }
  },
  {
    id: 'calc.evaluate',
    title: 'Calculator',
    keywords: ['calculator', 'calc', 'math'],
    aliases: [],
    icon: 'calculator',
    kind: 'instant',
    priority: 95,
    copies: true,
    paramsSchema: s.obj({ expression: s.str(200, 1) }),
    parse(input) {
      const r = evaluateMath(input)
      return r ? { params: { expression: String(input).trim() }, confidence: 1, extra: r } : null
    },
    describe: (p) => {
      const r = evaluateMath(p.expression)
      return {
        title: r ? `= ${r.display}` : 'Calculator',
        subtitle: r ? `${p.expression} · ↵ to copy` : ''
      }
    }
  },
  {
    id: 'convert.units',
    title: 'Unit conversion',
    keywords: ['convert', 'conversion', 'units'],
    aliases: [],
    icon: 'convert',
    kind: 'instant',
    priority: 94,
    copies: true,
    paramsSchema: s.obj({ input: s.str(200, 1) }),
    parse(input) {
      const r = convertUnits(input)
      return r ? { params: { input: String(input).trim() }, confidence: 1 } : null
    },
    describe: (p) => {
      const r = convertUnits(p.input)
      return {
        title: r ? `= ${r.text}` : 'Unit conversion',
        subtitle: r ? `${r.from} · ↵ to copy` : ''
      }
    }
  },
  {
    id: 'file.open',
    title: 'Open file',
    keywords: ['open', 'file', 'find file', 'reveal'],
    aliases: [],
    icon: 'file',
    kind: 'instant',
    priority: 50,
    paramsSchema: s.obj({ path: s.str(1000, 1), reveal: s.opt(s.bool), isDir: s.opt(s.bool) }),
    parse(input) {
      return looksLikePath(input)
        ? { params: { path: String(input).trim() }, confidence: 0.92 }
        : null
    },
    describe: (p) => ({
      title: `${p.reveal ? 'Reveal' : 'Open'} ${oneLine(p.path.split('/').filter(Boolean).pop() || p.path, 50)}`,
      subtitle: p.path.replace(/^\/Users\/[^/]+/, '~')
    })
  },
  {
    id: 'app.open',
    title: 'Open app',
    keywords: ['open app', 'launch'],
    aliases: [],
    icon: 'app',
    kind: 'instant',
    priority: 55,
    paramsSchema: s.obj({ path: s.str(1000, 1), name: optStr(200) }),
    describe: (p) => ({
      title: `Open ${
        p.name ??
        p.path
          .split('/')
          .pop()
          .replace(/\.app$/, '')
      }`,
      subtitle: p.path.replace(/^\/Users\/[^/]+/, '~')
    })
  },
  {
    id: 'web.search',
    aiHint: 'Search the web or look something up online, including general questions.',
    title: 'Search the web',
    keywords: ['search', 'google', 'web', 'duckduckgo', 'youtube'],
    aliases: [],
    icon: 'globe',
    kind: 'instant',
    priority: 10,
    paramsSchema: s.obj({
      query: s.str(500, 1),
      engine: s.opt(s.oneOf('google', 'duckduckgo', 'brave', 'kagi', 'youtube', 'custom'))
    }),
    parse(input) {
      const p = parseSearchPrefix(input)
      return p ? { params: { query: p.query, engine: p.engine }, confidence: 0.95 } : null
    },
    describe(p, ctx) {
      const engine = p.engine ?? ctx.settings.searchEngine
      return {
        title: `Search ${engineName(engine, ctx.settings.customSearchUrl)} for "${oneLine(p.query, 45)}"`,
        subtitle: buildSearchUrl(engine, p.query, ctx.settings.customSearchUrl)
          .replace(/^https?:\/\//, '')
          .slice(0, 70)
      }
    }
  },
  {
    id: 'web.openUrl',
    aiHint: 'Open a website, web address or URL in the browser.',
    title: 'Open URL',
    keywords: ['url', 'open url', 'website'],
    aliases: [],
    icon: 'link',
    kind: 'instant',
    priority: 60,
    paramsSchema: s.obj({ url: s.str(2000, 1) }),
    parse(input) {
      const url = normalizeUrl(input)
      return url ? { params: { url }, confidence: 0.99 } : null
    },
    describe: (p) => ({
      title: `Open ${oneLine(p.url.replace(/^https?:\/\//, ''), 60)}`,
      subtitle: 'In your default browser'
    })
  },
  {
    id: 'pomodoro.start',
    aiHint: 'Start a pomodoro focus session: timed work intervals separated by short breaks.',
    title: 'Pomodoro',
    description: 'Focus / break cycles that run in the background',
    keywords: ['pomodoro', 'focus session', 'focus timer', 'deep work'],
    aliases: ['start pomodoro'],
    icon: 'pomodoro',
    kind: 'widget',
    priority: 78,
    paramsSchema: s.obj({}),
    describe: () => ({ title: 'Start Pomodoro', subtitle: 'Focus and break cycles' })
  },
  {
    id: 'calendar.agenda',
    aiHint: "Show what is on the calendar for today or tomorrow: the day's agenda or schedule.",
    title: 'Agenda',
    description: "Today's and tomorrow's Google Calendar events",
    keywords: ['agenda', 'my day', 'today', 'tomorrow', 'schedule today', "what's on"],
    aliases: ['today agenda'],
    icon: 'agenda',
    kind: 'widget',
    priority: 84,
    paramsSchema: s.obj({ day: s.opt(s.oneOf('today', 'tomorrow')) }),
    parse(input) {
      const m = String(input)
        .trim()
        .match(
          /^(?:agenda|my day|(?:what'?s|what is) on (today|tomorrow)|(today|tomorrow)(?:'s)?\s+(?:agenda|schedule|events|calendar|meetings))$/i
        )
      if (!m) return null
      const day = (m[1] ?? m[2] ?? 'today').toLowerCase()
      return { params: { day }, confidence: 0.96 }
    },
    describe: (p) => ({
      title: p.day === 'tomorrow' ? "Tomorrow's agenda" : "Today's agenda",
      subtitle: 'Google Calendar'
    })
  },
  {
    id: 'clipboard.history',
    aiHint: 'Look through or paste something that was copied earlier (the clipboard history).',
    title: 'Clipboard history',
    description: 'Search what you copied recently (opt-in, kept in memory only)',
    keywords: ['clipboard', 'paste', 'copied', 'clipboard history'],
    aliases: ['clip'],
    icon: 'clipboard',
    kind: 'widget',
    priority: 65,
    paramsSchema: s.obj({ query: optStr(200) }),
    parse(input) {
      const m = String(input).match(/^(?:clip|clipboard|paste)\s*[:\s]\s*(.+)$/i)
      return m ? { params: { query: m[1].trim() }, confidence: 0.9 } : null
    },
    describe: (p) => ({
      title: p.query ? `Clipboard: "${oneLine(p.query, 36)}"` : 'Clipboard history',
      subtitle: 'Recent copies'
    })
  },
  {
    id: 'snippets.open',
    aiHint: 'Insert, find or manage saved text snippets (reusable canned text).',
    title: 'Snippets',
    description: 'Saved text you can copy in one keystroke',
    keywords: ['snippet', 'snippets', 'canned text', 'template text', 'text expansion'],
    aliases: ['my snippets'],
    icon: 'snippet',
    kind: 'widget',
    priority: 64,
    paramsSchema: s.obj({ query: optStr(100), create: s.opt(s.bool) }),
    parse(input) {
      const m = String(input).match(/^;\s*(.*)$/)
      return m ? { params: { query: m[1].trim() }, confidence: 0.95 } : null
    },
    describe: (p) => ({
      title: p.query ? `Snippets: "${oneLine(p.query, 30)}"` : 'Snippets',
      subtitle: 'Type ; to search quickly'
    })
  },
  {
    id: 'snippet.copy',
    title: 'Copy snippet',
    keywords: ['snippet'],
    aliases: [],
    icon: 'snippet',
    kind: 'instant',
    priority: 66,
    copies: true,
    paramsSchema: s.obj({ id: s.int(1), name: optStr(80) }),
    describe: (p) => ({
      title: `Snippet: ${oneLine(p.name ?? 'Untitled', 40)}`,
      subtitle: '↵ to copy'
    })
  },
  {
    id: 'currency.convert',
    title: 'Currency conversion',
    keywords: ['currency', 'exchange rate', 'convert money'],
    aliases: [],
    icon: 'currency',
    kind: 'instant',
    live: true,
    onRun: 'copy',
    priority: 93,
    copies: true,
    paramsSchema: s.obj({ amount: s.num(0, 1e12), from: s.str(3, 3), to: s.str(3, 3) }),
    parse(input) {
      const c = parseCurrency(input)
      return c ? { params: c, confidence: 1 } : null
    },
    describe: (p) => ({
      title: `${formatMoney(p.amount, p.from)} → ${p.to}`,
      subtitle: 'Fetching the latest rate…'
    })
  },
  ...EXTRA_ACTIONS
]

const BY_ID = new Map(ACTIONS.map((a) => [a.id, a]))

export const getAction = (id) => BY_ID.get(id)
export const actionIds = () => ACTIONS.map((a) => a.id)

/** Actions the AI may suggest (excludes ones that need live local state or computed results). */
export const AI_ACTION_IDS = ACTIONS.filter(
  (a) =>
    a.aiHint &&
    !['record.stop', 'calc.evaluate', 'convert.units', 'app.open', 'file.open'].includes(a.id)
).map((a) => a.id)

export function isEnabled(action, settings, ctx = {}) {
  if (settings.disabledActions?.includes(action.id)) return false
  if (action.id === 'record.stop') return Boolean(ctx.recording)
  if (action.id === 'record.start') return !ctx.recording
  return true
}

/** Build a display row ("suggestion") for an action + params. */
export function makeSuggestion(action, params, ctx, extra = {}) {
  const { title, subtitle } = action.describe(params, ctx)
  return {
    key: `${action.id}:${stableStringify(params)}`,
    actionId: action.id,
    params,
    title,
    subtitle,
    icon: action.icon,
    kind: action.kind,
    copies: Boolean(action.copies),
    priority: action.priority,
    matchScore: 0,
    aiConfidence: 0,
    source: 'local',
    ...extra
  }
}

export function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  const keys = Object.keys(v)
    .filter((k) => v[k] !== undefined)
    .sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`
}
