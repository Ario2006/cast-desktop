import * as s from './validate.js'

/** key -> { default, validate } — single source of truth for settings. */
const SCHEMA = {
  // General
  shortcut: { default: 'Alt+Space', validate: s.str(60, 1) },
  launchAtLogin: { default: false, validate: s.bool },
  hideOnBlur: { default: true, validate: s.bool },
  showOnActiveDisplay: { default: true, validate: s.bool },
  theme: { default: 'system', validate: s.oneOf('system', 'light', 'dark') },
  // Suggestions
  smartSuggestions: { default: true, validate: s.bool },
  aiBaseUrl: {
    default: 'https://api.openai.com/v1',
    validate: (x, p) => {
      s.str(300, 1)(x, p)
      let u
      try {
        u = new URL(x)
      } catch {
        throw new s.ValidationError(`${p}: not a valid URL`)
      }
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
      if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) {
        throw new s.ValidationError(`${p}: must be https (or http on localhost)`)
      }
      return x.replace(/\/+$/, '')
    }
  },
  aiModel: { default: 'gpt-4o-mini', validate: s.str(120, 1) },
  maxResults: { default: 7, validate: s.int(3, 7) },
  showRecentOnEmpty: { default: true, validate: s.bool },
  // Actions
  disabledActions: { default: [], validate: s.arr(s.str(60), 50) },
  favorites: { default: [], validate: s.arr(s.str(60), 20) },
  timerSound: {
    default: 'Glass',
    validate: s.oneOf('none', 'Glass', 'Ping', 'Hero', 'Submarine', 'Funk', 'Sosumi')
  },
  trayTimerTitle: { default: true, validate: s.bool },
  // Calendar
  googleClientId: { default: '', validate: s.str(300) },
  calendarDefaultId: { default: 'primary', validate: s.str(300, 1) },
  defaultEventMinutes: { default: 30, validate: s.int(5, 1440) },
  calendarMeetDefault: { default: false, validate: s.bool },
  // Capture
  screenshotFolder: { default: '~/Pictures/Cast', validate: s.str(500, 1) },
  recordingFolder: { default: '~/Movies/Cast', validate: s.str(500, 1) },
  screenshotFormat: { default: 'png', validate: s.oneOf('png', 'jpg') },
  copyScreenshotToClipboard: { default: true, validate: s.bool },
  recordMic: { default: false, validate: s.bool },
  stopRecordingShortcut: { default: 'Alt+Shift+Space', validate: s.str(60, 1) },
  // Search
  searchEngine: {
    default: 'google',
    validate: s.oneOf('google', 'duckduckgo', 'brave', 'kagi', 'custom')
  },
  customSearchUrl: {
    default: '',
    validate: (x, p) => {
      s.str(500)(x, p)
      if (x && (!x.includes('{query}') || !/^https?:\/\//i.test(x))) {
        throw new s.ValidationError(`${p}: must be an http(s) URL containing {query}`)
      }
      return x
    }
  },
  // Privacy
  keepHistory: { default: true, validate: s.bool }
}

export const SETTING_KEYS = Object.keys(SCHEMA)
export const DEFAULT_SETTINGS = Object.fromEntries(
  Object.entries(SCHEMA).map(([k, v]) => [k, v.default])
)

export function validateSetting(key, value) {
  const entry = Object.hasOwn(SCHEMA, key) ? SCHEMA[key] : null
  if (!entry) throw new s.ValidationError(`unknown setting "${key}"`)
  return entry.validate(value, key)
}
