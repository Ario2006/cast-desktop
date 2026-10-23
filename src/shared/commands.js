import { parseWhen } from './timeparse.js'

const clean = (s) => String(s).trim().replace(/\s+/g, ' ')

// --- weather ----------------------------------------------------------------------------------
/** "weather", "weather in paris", "paris weather", "will it rain tomorrow", "forecast" */
export function parseWeather(input) {
  const t = clean(input)
    .toLowerCase()
    .replace(/[?!.]$/, '')
  let m
  const day = /\btomorrow\b/.test(t) ? 'tomorrow' : 'today'
  const body = t
    .replace(/\b(?:today|tomorrow)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if ((m = body.match(/^(?:weather|forecast|temperature|temp)(?:\s+(?:in|for|at))?(?:\s+(.+))?$/)))
    return { place: m[1]?.trim() || undefined, day }
  if ((m = body.match(/^(.+?)\s+(?:weather|forecast)$/))) return { place: m[1].trim(), day }
  if (
    (m = body.match(
      /^(?:will it|is it going to|is it gonna)\s+(?:rain|snow|be (?:hot|cold|sunny))(?:\s+in\s+(.+))?$/
    ))
  )
    return { place: m[1]?.trim() || undefined, day }
  return null
}

// --- quick answers ------------------------------------------------------------------------------
/** "define serendipity" -> dictionary · "who is ada lovelace" / "wiki rust" -> encyclopedia */
export function parseAnswer(input) {
  const t = clean(input).replace(/[?!.]$/, '')
  let m
  if (
    (m = t.match(/^(?:define|definition of|meaning of|dictionary|dict)\s+(.+)$/i)) ||
    (m = t.match(/^what does\s+(.+?)\s+mean$/i))
  ) {
    const word = m[1].trim()
    return word.split(' ').length <= 3 ? { kind: 'define', query: word } : null
  }
  if (
    (m = t.match(
      /^(?:wiki|wikipedia|who (?:is|was|are|were)|what (?:is|are|was|were) (?:a |an |the )?|tell me about)\s*(.+)$/i
    ))
  ) {
    const q = m[1].trim()
    if (!q || /[\d+\-*/^=]/.test(q) || /^(?:on|the time|today|tomorrow|my|it)\b/i.test(q))
      return null
    return { kind: 'wiki', query: q }
  }
  return null
}

// --- translate ---------------------------------------------------------------------------------
export const LANGUAGES = {
  english: 'en', spanish: 'es', french: 'fr', german: 'de', italian: 'it', portuguese: 'pt', dutch: 'nl', russian: 'ru',
  ukrainian: 'uk', polish: 'pl', czech: 'cs', swedish: 'sv', norwegian: 'no', danish: 'da', finnish: 'fi', greek: 'el',
  turkish: 'tr', arabic: 'ar', hebrew: 'he', hindi: 'hi', bengali: 'bn', urdu: 'ur', tamil: 'ta', telugu: 'te',
  marathi: 'mr', gujarati: 'gu', punjabi: 'pa', kannada: 'kn', malayalam: 'ml', chinese: 'zh-CN', mandarin: 'zh-CN',
  japanese: 'ja', korean: 'ko', vietnamese: 'vi', thai: 'th', indonesian: 'id', malay: 'ms', filipino: 'tl',
  persian: 'fa', swahili: 'sw', romanian: 'ro', hungarian: 'hu'
} // prettier-ignore
const CODES = new Set(Object.values(LANGUAGES))
const lang = (s) => {
  const k = String(s).trim().toLowerCase()
  return LANGUAGES[k] ?? (CODES.has(k) ? k : null)
}
export const languageName = (code) =>
  Object.entries(LANGUAGES)
    .find(([, c]) => c === code)?.[0]
    ?.replace(/^\w/, (c) => c.toUpperCase()) ?? code

/** "translate good morning to spanish" · "tr fr thank you" · "how do you say thanks in japanese" */
export function parseTranslate(input) {
  const t = clean(input)
  let m
  if ((m = t.match(/^(?:translate|tr)\s+(.+?)\s+(?:to|into|in)\s+([a-z-]+)$/i))) {
    const to = lang(m[2])
    return to ? { text: m[1].replace(/^["'“]|["'”]$/g, ''), to } : null
  }
  if ((m = t.match(/^(?:tr|translate)\s+([a-z-]{2,10})\s+(.+)$/i)) && lang(m[1]))
    return { text: m[2], to: lang(m[1]) }
  if ((m = t.match(/^how (?:do (?:you|i)|to) say\s+(.+?)\s+in\s+([a-z-]+)$/i))) {
    const to = lang(m[2])
    return to ? { text: m[1].replace(/^["'“]|["'”]$/g, ''), to } : null
  }
  return null
}

// --- system commands ---------------------------------------------------------------------------
export const SYSTEM_COMMANDS = {
  lock: { label: 'Lock screen', words: ['lock', 'lock screen', 'lock mac', 'lock computer'] },
  sleep: { label: 'Sleep', words: ['sleep', 'sleep mac', 'go to sleep', 'sleep now'] },
  displaysleep: { label: 'Turn display off', words: ['display off', 'screen off', 'sleep display', 'turn off display'] },
  darkmode: { label: 'Toggle dark mode', words: ['dark mode', 'toggle dark mode', 'light mode', 'toggle appearance', 'night mode'] },
  screensaver: { label: 'Start screen saver', words: ['screensaver', 'screen saver', 'start screensaver'] },
  mute: { label: 'Mute', words: ['mute', 'mute volume', 'mute sound'] },
  unmute: { label: 'Unmute', words: ['unmute', 'unmute volume', 'sound on'] },
  volume: { label: 'Set volume', words: [] },
  wifion: { label: 'Turn Wi-Fi on', words: ['wifi on', 'wi-fi on', 'turn on wifi', 'turn wifi on', 'enable wifi'] },
  wifioff: { label: 'Turn Wi-Fi off', words: ['wifi off', 'wi-fi off', 'turn off wifi', 'turn wifi off', 'disable wifi'] },
  emptytrash: { label: 'Empty Trash', words: ['empty trash', 'empty bin', 'clear trash'], confirm: 'Permanently delete everything in the Trash?' },
  restart: { label: 'Restart', words: ['restart', 'reboot', 'restart mac'], confirm: 'Restart your Mac now? Unsaved work in other apps may be lost.' },
  shutdown: { label: 'Shut down', words: ['shut down', 'shutdown', 'power off', 'turn off mac'], confirm: 'Shut down your Mac now? Unsaved work in other apps may be lost.' },
  logout: { label: 'Log out', words: ['log out', 'logout', 'sign out'], confirm: 'Log out of macOS now?' },
  hideall: { label: 'Hide all apps', words: ['hide all', 'hide all apps', 'show desktop'] },
  quitall: { label: 'Quit all apps', words: ['quit all', 'quit all apps', 'close all apps'], confirm: 'Quit every open app? They may ask to save documents.' },
  ejectall: { label: 'Eject all disks', words: ['eject', 'eject all', 'eject disks', 'eject drives'] }
} // prettier-ignore
const SYSTEM_WORDS = new Map(
  Object.entries(SYSTEM_COMMANDS).flatMap(([cmd, d]) => d.words.map((w) => [w, cmd]))
)

/** "lock" -> { command: 'lock' } · "volume 40" -> { command: 'volume', level: 40 } */
export function parseSystem(input) {
  const t = clean(input).toLowerCase()
  const m = t.match(/^(?:set\s+)?volume(?:\s+to)?\s+(\d{1,3})%?$/)
  if (m) return { command: 'volume', level: Math.min(100, Number(m[1])) }
  const cmd = SYSTEM_WORDS.get(t)
  return cmd ? { command: cmd } : null
}

// --- tasks -------------------------------------------------------------------------------------
/** "todo buy milk", "task call bank by friday", "t: ship release tomorrow 5pm" */
export function parseTask(input, now = new Date()) {
  const m = clean(input).match(/^(?:todo|to-do|task|add task|add todo|t:)\s*:?\s+(.+)$/i)
  if (!m) return null
  let text = m[1]
  let due
  const dueMatch =
    text.match(/\s+(?:by|due|before|on)\s+(.+)$/i) ??
    text.match(
      /\s+((?:today|tonight|tomorrow|next \w+|this \w+|(?:mon|tues|wednes|thurs|fri|satur|sun)day)(?:\s.*)?)$/i
    )
  if (dueMatch) {
    const when = parseWhen(dueMatch[1], now)
    if (when) {
      due = when
      text = text.slice(0, dueMatch.index)
    }
  }
  text = text.trim()
  return text ? { text: text[0].toUpperCase() + text.slice(1), due: due?.toISOString() } : null
}

// --- time tracking ------------------------------------------------------------------------------
export function parseTracking(input) {
  const t = clean(input)
  let m
  if (/^(?:stop tracking|stop track|end tracking|clock out|stop working)$/i.test(t))
    return { op: 'stop' }
  if (/^(?:timesheet|time report|tracked time|time spent|my time|hours this week)$/i.test(t))
    return { op: 'report' }
  if (
    (m = t.match(/^(?:track|start tracking|clock in(?: on)?|working on|start working on)\s+(.+)$/i))
  ) {
    return { op: 'start', project: m[1].trim().slice(0, 60) }
  }
  return null
}

// --- meetings ------------------------------------------------------------------------------------
export const parseMeeting = (input) =>
  /^(?:join|join meeting|join call|join (?:the )?next (?:meeting|call)|next meeting|open meeting|meet now|zoom)$/i.test(
    clean(input)
  )
    ? {}
    : null

/** Find a video-call link in a calendar event (Meet, Zoom, Teams, Webex, Whereby). */
export function meetingLink(event) {
  if (event?.hangoutLink) return event.hangoutLink
  const text = [
    event?.location,
    event?.description,
    ...(event?.conferenceData?.entryPoints ?? []).map((e) => e.uri)
  ]
    .filter(Boolean)
    .join(' ')
  const m = text.match(
    /https?:\/\/(?:[\w-]+\.)?(?:zoom\.us\/(?:j|my|w)\/[\w?=&./-]+|meet\.google\.com\/[\w-]+|teams\.microsoft\.com\/l\/meetup-join\/[^\s"<>]+|teams\.live\.com\/meet\/[^\s"<>]+|[\w-]+\.webex\.com\/[^\s"<>]+|whereby\.com\/[\w-]+)/i
  )
  return m ? m[0].replace(/[).,]+$/, '') : null
}

// --- window layouts --------------------------------------------------------------------------------
export const LAYOUTS = {
  left: { label: 'Left half', words: ['left half', 'left', 'snap left', 'window left'] },
  right: { label: 'Right half', words: ['right half', 'right', 'snap right', 'window right'] },
  top: { label: 'Top half', words: ['top half', 'snap top'] },
  bottom: { label: 'Bottom half', words: ['bottom half', 'snap bottom'] },
  maximize: { label: 'Maximize', words: ['maximize', 'maximise', 'fill screen', 'full size', 'max window'] },
  almost: { label: 'Almost maximize', words: ['almost maximize', 'almost maximise'] },
  center: { label: 'Center', words: ['center', 'centre', 'center window', 'centre window'] },
  leftthird: { label: 'Left third', words: ['left third', 'first third'] },
  centerthird: { label: 'Center third', words: ['center third', 'middle third'] },
  rightthird: { label: 'Right third', words: ['right third', 'last third'] },
  lefttwothirds: { label: 'Left two thirds', words: ['left two thirds', 'first two thirds'] },
  righttwothirds: { label: 'Right two thirds', words: ['right two thirds', 'last two thirds'] },
  nextdisplay: { label: 'Next display', words: ['next display', 'next screen', 'move to other screen', 'other display'] }
} // prettier-ignore
const LAYOUT_WORDS = new Map(
  Object.entries(LAYOUTS).flatMap(([k, d]) => d.words.map((w) => [w, k]))
)
export const parseWindowLayout = (input) => {
  const k = LAYOUT_WORDS.get(clean(input).toLowerCase())
  return k ? { layout: k } : null
}

/** Target frame for a layout inside a display work area {x,y,width,height}. */
export function layoutFrame(layout, area, current) {
  const { x, y, width: w, height: h } = area
  const r = (fx, fy, fw, fh) => ({ x: Math.round(x + w * fx), y: Math.round(y + h * fy), width: Math.round(w * fw), height: Math.round(h * fh) })
  switch (layout) {
    case 'left': return r(0, 0, 0.5, 1)
    case 'right': return r(0.5, 0, 0.5, 1)
    case 'top': return r(0, 0, 1, 0.5)
    case 'bottom': return r(0, 0.5, 1, 0.5)
    case 'maximize': return r(0, 0, 1, 1)
    case 'almost': return r(0.05, 0.05, 0.9, 0.9)
    case 'leftthird': return r(0, 0, 1 / 3, 1)
    case 'centerthird': return r(1 / 3, 0, 1 / 3, 1)
    case 'rightthird': return r(2 / 3, 0, 1 / 3, 1)
    case 'lefttwothirds': return r(0, 0, 2 / 3, 1)
    case 'righttwothirds': return r(1 / 3, 0, 2 / 3, 1)
    case 'center': {
      const cw = Math.min(current?.width ?? w * 0.6, w)
      const ch = Math.min(current?.height ?? h * 0.7, h)
      return { x: Math.round(x + (w - cw) / 2), y: Math.round(y + (h - ch) / 2), width: Math.round(cw), height: Math.round(ch) }
    }
    default: return null
  }
} // prettier-ignore

// --- quick capture -----------------------------------------------------------------------------
export const CAPTURE_TARGETS = { notes: 'Apple Notes', obsidian: 'Obsidian', notion: 'Notion' }
/** "apple note: buy milk" · "obsidian: idea" · "notion: draft" · "capture X to obsidian" */
export function parseCapture(input) {
  const t = clean(input)
  let m
  if ((m = t.match(/^(apple notes?|obsidian|notion)\s*:\s*(.+)$/i))) {
    const target = /apple/i.test(m[1]) ? 'notes' : m[1].toLowerCase()
    return { target, text: m[2] }
  }
  if (
    (m = t.match(
      /^(?:capture|send|save)\s+(.+?)\s+to\s+(apple notes?|notes app|obsidian|notion)$/i
    ))
  ) {
    const target = /apple|notes app/i.test(m[2]) ? 'notes' : m[2].toLowerCase()
    return { target, text: m[1] }
  }
  return null
}

// --- developer helpers ----------------------------------------------------------------------------
/** "ports" · "port 3000" · "kill 3000" · "kill port 3000" */
export function parsePorts(input) {
  const t = clean(input).toLowerCase()
  let m
  if (/^(?:ports|open ports|listening ports|localhost|what'?s running|lsof)$/.test(t))
    return { op: 'list' }
  if ((m = t.match(/^(?:what'?s on |port )(\d{2,5})$/))) return { op: 'list', port: Number(m[1]) }
  if ((m = t.match(/^(?:kill|free|stop)(?: port)? :?(\d{2,5})$/)))
    return { op: 'kill', port: Number(m[1]) }
  return null
}

/** "proj cast" · "open project cast" · "code cast" · "repo cast" */
export function parseProject(input) {
  const m = clean(input).match(/^(?:proj|project|open project|code|repo|vscode)\s+(.+)$/i)
  return m ? { query: m[1].trim() } : null
}

/** "call mom" · "facetime sam" · "message alex" · "email jane" */
export function parseContact(input) {
  const m = clean(input).match(
    /^(call|phone|ring|facetime|facetime audio|message|text|imessage|email|mail)\s+(.+)$/i
  )
  if (!m) return null
  const verb = m[1].toLowerCase()
  const via =
    verb === 'facetime'
      ? 'facetime'
      : verb === 'facetime audio'
        ? 'facetime-audio'
        : /^(message|text|imessage)$/.test(verb)
          ? 'message'
          : /^(email|mail)$/.test(verb)
            ? 'email'
            : 'call'
  return { via, query: m[2].trim() }
}

/** "shortcut morning" · "run shortcut morning" · "sc morning" */
export function parseShortcut(input) {
  const m = clean(input).match(/^(?:run shortcut|shortcut|shortcuts|sc)\s+(.+)$/i)
  return m ? { query: m[1].trim() } : null
}

/** Documentation / package search prefixes. */
export const DOC_SITES = {
  npm: { name: 'npm', url: 'https://www.npmjs.com/search?q={query}' },
  mdn: { name: 'MDN', url: 'https://developer.mozilla.org/en-US/search?q={query}' },
  py: { name: 'Python docs', url: 'https://docs.python.org/3/search.html?q={query}' },
  pypi: { name: 'PyPI', url: 'https://pypi.org/search/?q={query}' },
  crates: { name: 'crates.io', url: 'https://crates.io/search?q={query}' },
  go: { name: 'Go packages', url: 'https://pkg.go.dev/search?q={query}' },
  so: { name: 'Stack Overflow', url: 'https://stackoverflow.com/search?q={query}' },
  gh: { name: 'GitHub', url: 'https://github.com/search?q={query}&type=repositories' },
  caniuse: { name: 'Can I use', url: 'https://caniuse.com/?search={query}' },
  devdocs: { name: 'DevDocs', url: 'https://devdocs.io/#q={query}' }
} // prettier-ignore
export function parseDocs(input) {
  const m = clean(input).match(/^([a-z]+)\s+(.+)$/i)
  if (!m) return null
  const site = m[1].toLowerCase()
  if (site === 'gh' && /^(?:pr|prs|pulls|issues|notifications)$/i.test(m[2])) {
    const path = {
      pr: 'pulls',
      prs: 'pulls',
      pulls: 'pulls',
      issues: 'issues',
      notifications: 'notifications'
    }[m[2].toLowerCase()]
    return { site: 'gh', query: m[2], url: `https://github.com/${path}` }
  }
  return DOC_SITES[site]
    ? { site, query: m[2], url: DOC_SITES[site].url.replace('{query}', encodeURIComponent(m[2])) }
    : null
}

/** Expand a user quicklink: template "https://jira.acme.com/browse/{query}" + "ABC-12". */
export const expandQuicklink = (template, query) =>
  template.includes('{query}')
    ? template.replaceAll('{query}', encodeURIComponent(query))
    : template
