export const ENGINES = {
  google: { name: 'Google', url: 'https://www.google.com/search?q={query}' },
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q={query}' },
  brave: { name: 'Brave', url: 'https://search.brave.com/search?q={query}' },
  kagi: { name: 'Kagi', url: 'https://kagi.com/search?q={query}' },
  youtube: { name: 'YouTube', url: 'https://www.youtube.com/results?search_query={query}' }
}

const PREFIXES = {
  g: 'google',
  google: 'google',
  ddg: 'duckduckgo',
  duck: 'duckduckgo',
  yt: 'youtube',
  youtube: 'youtube',
  kagi: 'kagi',
  brave: 'brave'
}

/** "g cats", "yt lofi" -> { engine, query } */
export function parseSearchPrefix(input) {
  const m = String(input).match(/^([a-z]+)\s+(.+)$/i)
  if (!m) return null
  const engine = PREFIXES[m[1].toLowerCase()]
  return engine ? { engine, query: m[2].trim() } : null
}

export function engineName(engine, custom) {
  if (engine === 'custom') return custom ? new URL(custom.replace('{query}', 'x')).hostname : 'Web'
  return ENGINES[engine]?.name ?? 'Google'
}

export function buildSearchUrl(engine, query, customTemplate = '') {
  const template = engine === 'custom' && customTemplate ? customTemplate : ENGINES[engine]?.url
  const url = (template ?? ENGINES.google.url).replace('{query}', encodeURIComponent(query))
  return url
}

const TLDS = 'com|org|net|io|dev|app|ai|co|edu|gov|me|xyz|in|uk|de|so|sh|tv|fm|gg|ly|us|ca|au|info'
const BARE_DOMAIN = new RegExp(`^(?:[a-z0-9-]+\\.)+(?:${TLDS})(?::\\d+)?(?:[/?#]\\S*)?$`, 'i')

/** Returns a normalized http(s) URL or null. */
export function normalizeUrl(input) {
  const t = String(input).trim()
  if (/\s/.test(t) || t.length > 2000) return null
  if (/^https?:\/\/\S+$/i.test(t)) {
    try {
      return new URL(t).toString()
    } catch {
      return null
    }
  }
  if (BARE_DOMAIN.test(t)) return `https://${t}`
  return null
}

export function looksLikePath(input) {
  const t = String(input).trim()
  return t === '~' || /^~\/\S/.test(t) || /^\/[^/\s]/.test(t)
}
