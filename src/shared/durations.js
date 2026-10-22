const UNIT_SECONDS = {
  h: 3600,
  hr: 3600,
  hrs: 3600,
  hour: 3600,
  hours: 3600,
  m: 60,
  min: 60,
  mins: 60,
  minute: 60,
  minutes: 60,
  s: 1,
  sec: 1,
  secs: 1,
  second: 1,
  seconds: 1
}

export const MAX_DURATION_SECONDS = 99 * 3600

const TOKEN = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b/gi
// "1h30" style (hours immediately followed by bare minutes)
const COMPACT = /\b(\d+)h(\d{1,2})\b/i

const WORD_NUMBERS = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, ninety: 90
} // prettier-ignore
const UNIT_WORDS = 'hours?|hrs?|minutes?|mins?|seconds?|secs?'
const WORD_NUM_RE = new RegExp(
  `\\b(?:(twenty|thirty|forty|fifty)[-\\s](one|two|three|four|five|six|seven|eight|nine)|(${Object.keys(WORD_NUMBERS).join('|')}))\\s+(?=(?:${UNIT_WORDS})\\b)`,
  'gi'
)

/** "ten minutes" -> "10 minutes", "twenty five min" -> "25 min", "half an hour" -> "30 minutes". */
function numberWordsToDigits(text) {
  return text
    .replace(/\bhalf an? hour\b/gi, '30 minutes')
    .replace(WORD_NUM_RE, (_m, tens, ones, single) =>
      tens
        ? `${WORD_NUMBERS[tens.toLowerCase()] + WORD_NUMBERS[ones.toLowerCase()]} `
        : `${WORD_NUMBERS[single.toLowerCase()]} `
    )
}

/**
 * Pull durations out of free text. Returns the total in seconds and the text with the
 * matched durations removed. `seconds` is null when nothing matched.
 */
export function extractDuration(text) {
  let rest = numberWordsToDigits(String(text))
  let total = 0
  let found = false

  const compact = rest.match(COMPACT)
  if (compact) {
    total += Number(compact[1]) * 3600 + Number(compact[2]) * 60
    rest = rest.replace(COMPACT, ' ')
    found = true
  }
  rest = rest.replace(TOKEN, (_m, n, unit) => {
    total += Number(n) * UNIT_SECONDS[unit.toLowerCase()]
    found = true
    return ' '
  })
  if (!found) return { seconds: null, rest: String(text) }
  const seconds = Math.round(total)
  return { seconds, rest: rest.replace(/\s+/g, ' ').trim() }
}

const clampValid = (s) => (s > 0 && s <= MAX_DURATION_SECONDS ? s : null)

/**
 * Local timer parser.
 *  "25m" / "1h 30m" / "in 10 minutes"          -> { seconds }
 *  "timer 10 min" / "timer for 5 min pasta"    -> { seconds, label }
 */
export function parseTimerInput(input) {
  const text = String(input).trim()
  if (!text) return null
  const explicit = text.match(/^(?:set\s+(?:a\s+)?)?(?:timer|countdown)\b\s*(?:for\s+)?(.*)$/i)
  const body = explicit ? explicit[1] : text.replace(/^in\s+/i, '')
  if (!body) return null
  const { seconds, rest } = extractDuration(body)
  const valid = seconds && clampValid(seconds)
  if (!valid) return null
  if (explicit) {
    const label = rest.replace(/^(?:for|to|-|:)\s+/i, '').trim()
    return { seconds: valid, label: label || undefined }
  }
  // bare durations must be only a duration ("25m", "1h 30m", "in 2 hours")
  return rest === '' ? { seconds: valid } : null
}

export function formatDuration(seconds) {
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const parts = []
  if (h) parts.push(`${h} h`)
  if (m) parts.push(`${m} min`)
  if (sec && !h) parts.push(`${sec} sec`)
  return parts.join(' ') || '0 sec'
}

/** "25-minute", "2-hour", "1 h 30 min" — reads naturally before the word "timer". */
export function durationPhrase(seconds) {
  const s = Math.round(seconds)
  if (s % 3600 === 0) return `${s / 3600}-hour`
  if (s % 60 === 0 && s < 3600) return `${s / 60}-minute`
  if (s < 60) return `${s}-second`
  return formatDuration(s)
}

/** "04:32" or "1:04:32" */
export function formatClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

/** Stopwatch format with centiseconds: "01:23.45" */
export function formatStopwatch(ms) {
  const total = Math.max(0, Math.floor(ms))
  const cs = Math.floor((total % 1000) / 10)
  const secs = Math.floor(total / 1000)
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  const pad = (n) => String(n).padStart(2, '0')
  return `${h ? `${h}:` : ''}${pad(m)}:${pad(s)}.${pad(cs)}`
}
