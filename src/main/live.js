import crypto from 'node:crypto'
import { languageName } from '../shared/commands.js'
import { formatMoney } from '../shared/currency.js'
import { TRANSFORM_LABELS, applyTransform, generate } from '../shared/devtools.js'

const fail = (code, message) => Object.assign(new Error(message), { code })

/** WMO weather codes (Open-Meteo) -> [label, icon name] (icons are SVGs in the renderer) */
const WMO = {
  0: ['Clear', 'weather-sun'], 1: ['Mostly clear', 'weather-partly'], 2: ['Partly cloudy', 'weather-partly'], 3: ['Overcast', 'weather-cloud'],
  45: ['Fog', 'weather-fog'], 48: ['Freezing fog', 'weather-fog'], 51: ['Light drizzle', 'weather-drizzle'], 53: ['Drizzle', 'weather-drizzle'], 55: ['Heavy drizzle', 'weather-rain'],
  56: ['Freezing drizzle', 'weather-rain'], 57: ['Freezing drizzle', 'weather-rain'], 61: ['Light rain', 'weather-drizzle'], 63: ['Rain', 'weather-rain'], 65: ['Heavy rain', 'weather-rain'],
  66: ['Freezing rain', 'weather-rain'], 67: ['Freezing rain', 'weather-rain'], 71: ['Light snow', 'weather-snow'], 73: ['Snow', 'weather-snow'], 75: ['Heavy snow', 'weather-snow'],
  77: ['Snow grains', 'weather-snow'], 80: ['Rain showers', 'weather-drizzle'], 81: ['Rain showers', 'weather-rain'], 82: ['Violent showers', 'weather-storm'],
  85: ['Snow showers', 'weather-snow'], 86: ['Heavy snow showers', 'weather-snow'], 95: ['Thunderstorm', 'weather-storm'], 96: ['Thunderstorm, hail', 'weather-storm'], 99: ['Thunderstorm, hail', 'weather-storm']
} // prettier-ignore
export const weatherLabel = (code) => WMO[code] ?? ['Unknown', 'weather-unknown']

/** Guess a city from the system timezone ("Asia/Kolkata" -> "Kolkata") when no location is set. */
// IANA keeps some historical city names; geocoders know the modern ones.
const TZ_CITY_ALIASES = {
  Calcutta: 'Kolkata', Saigon: 'Ho Chi Minh City', Kiev: 'Kyiv', Rangoon: 'Yangon', Katmandu: 'Kathmandu',
  Ulaanbaatar: 'Ulan Bator', Godthab: 'Nuuk', Asmera: 'Asmara', Thimbu: 'Thimphu', Dacca: 'Dhaka'
} // prettier-ignore
export const cityFromTimezone = (tz = Intl.DateTimeFormat().resolvedOptions().timeZone) => {
  if (!tz.includes('/')) return null
  const city = tz.split('/').pop().replace(/_/g, ' ')
  return TZ_CITY_ALIASES[city] ?? city
}

/**
 * Resolves "live" suggestion rows in the main process (network, clipboard, crypto).
 * Every resolver returns { title, subtitle, copyText?, url? } and throws coded errors
 * (OFFLINE, NOT_FOUND, …) the renderer turns into a friendly subtitle.
 */
export function createLiveResolver({
  fetch = globalThis.fetch,
  clipboard,
  getSettings,
  currency,
  calendarNext,
  now = Date.now
}) {
  const cache = new Map()
  const cached = async (key, ttlMs, fn) => {
    const hit = cache.get(key)
    if (hit && now() - hit.at < ttlMs) return hit.value
    const value = await fn()
    cache.set(key, { at: now(), value })
    if (cache.size > 200) cache.delete(cache.keys().next().value)
    return value
  }

  async function getJson(url, { allow404 = false } = {}) {
    let res
    try {
      res = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'Cast/0.1 (macOS launcher)' },
        signal: AbortSignal.timeout(7000)
      })
    } catch {
      throw fail('OFFLINE', 'You appear to be offline')
    }
    if (allow404 && res.status === 404) return null
    if (!res.ok) throw fail('HTTP', `The service is unavailable right now (${res.status})`)
    return res.json()
  }

  async function geocode(place) {
    return cached(`geo:${place.toLowerCase()}`, 7 * 86_400_000, async () => {
      const j = await getJson(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=10&language=en&format=json`
      )
      // "paris" should mean Paris, France: prefer the most populous match
      const r = (j?.results ?? [])
        .slice()
        .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))[0]
      if (!r) throw fail('NOT_FOUND', `Couldn’t find “${place}”`)
      return {
        lat: r.latitude,
        lon: r.longitude,
        name: [r.name, r.admin1 && r.admin1 !== r.name ? r.admin1 : null, r.country_code]
          .filter(Boolean)
          .join(', ')
      }
    })
  }

  const resolvers = {
    async 'currency.convert'({ amount, from, to }) {
      const r = await currency.convert(amount, from, to)
      const text = formatMoney(r.value, to)
      return {
        title: `= ${text}`,
        subtitle: `${formatMoney(amount, from)} · 1 ${from} = ${r.rate.toFixed(4)} ${to}${r.stale ? ' · offline rates' : r.date ? ` · ${r.date}` : ''}`,
        copyText: text
      }
    },

    async 'weather.show'({ place, day = 'today' }) {
      const s = getSettings()
      const where = place || s.weatherLocation || cityFromTimezone()
      if (!where) throw fail('NO_LOCATION', 'Set your city in Settings → General')
      const loc = await geocode(where)
      const unit = s.temperatureUnit
      const data = await cached(`wx:${loc.lat},${loc.lon},${unit}`, 10 * 60_000, () =>
        getJson(
          `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
            '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m' +
            '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code' +
            `&timezone=auto&forecast_days=2&temperature_unit=${unit}&wind_speed_unit=${unit === 'fahrenheit' ? 'mph' : 'kmh'}`
        )
      )
      const deg = unit === 'fahrenheit' ? '°F' : '°C'
      const i = day === 'tomorrow' ? 1 : 0
      const d = data.daily
      const [label, icon] = weatherLabel(
        day === 'tomorrow' ? d.weather_code[1] : data.current.weather_code
      )
      const rain = d.precipitation_probability_max?.[i]
      const range = `H ${Math.round(d.temperature_2m_max[i])}° · L ${Math.round(d.temperature_2m_min[i])}°`
      if (day === 'tomorrow') {
        return {
          title: `Tomorrow: ${label}, ${range}`,
          icon,
          subtitle: `${loc.name}${rain != null ? ` · ${rain}% chance of rain` : ''}`,
          copyText: `${label}, ${range} (${loc.name})`,
          url: `https://open-meteo.com/en/docs#latitude=${loc.lat}&longitude=${loc.lon}`
        }
      }
      const c = data.current
      return {
        title: `${Math.round(c.temperature_2m)}${deg} ${label}`,
        icon,
        subtitle: `${loc.name} · feels ${Math.round(c.apparent_temperature)}° · ${range}${rain != null ? ` · ${rain}% rain` : ''}`,
        copyText: `${Math.round(c.temperature_2m)}${deg} ${label} in ${loc.name}`,
        short: `${Math.round(c.temperature_2m)}°`
      }
    },

    async 'answer.define'({ query }) {
      return cached(`def:${query.toLowerCase()}`, 86_400_000, async () => {
        const j = await getJson(
          `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(query)}`,
          { allow404: true }
        )
        const entry = Array.isArray(j) ? j[0] : null
        const meaning = entry?.meanings?.[0]
        const def = meaning?.definitions?.[0]
        if (!def) throw fail('NOT_FOUND', `No dictionary entry for “${query}”`)
        return {
          title: def.definition,
          subtitle: `${entry.word}${entry.phonetic ? ` ${entry.phonetic}` : ''} · ${meaning.partOfSpeech}${def.example ? ` · “${def.example}”` : ''}`,
          copyText: def.definition,
          url: `https://en.wiktionary.org/wiki/${encodeURIComponent(entry.word)}`
        }
      })
    },

    async 'answer.wiki'({ query }) {
      return cached(`wiki:${query.toLowerCase()}`, 6 * 3_600_000, async () => {
        const search = await getJson(
          `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=1&namespace=0&format=json`
        )
        const title = search?.[1]?.[0]
        if (!title) throw fail('NOT_FOUND', `Nothing on Wikipedia for “${query}”`)
        const sum = await getJson(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`
        )
        const extract = String(sum?.extract ?? '').trim()
        if (!extract) throw fail('NOT_FOUND', `Nothing on Wikipedia for “${query}”`)
        const first =
          extract.match(/^.*?[.!?](?:\s|$)(?:.*?[.!?](?:\s|$))?/)?.[0]?.trim() ?? extract
        return {
          title: first,
          subtitle: `Wikipedia · ${sum.title}`,
          copyText: extract,
          url: sum.content_urls?.desktop?.page
        }
      })
    },

    async 'translate.text'({ text, to }) {
      return cached(`tr:${to}:${text}`, 86_400_000, async () => {
        const j = await getJson(
          `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 500))}&langpair=${encodeURIComponent(`Autodetect|${to}`)}`
        )
        const out = j?.responseData?.translatedText
        if (!out || j?.responseStatus >= 400 || /^(?:MYMEMORY WARNING|INVALID)/i.test(out)) {
          throw fail(
            'UNAVAILABLE',
            /QUOTA|WARNING/i.test(out ?? '')
              ? 'Free translation limit reached for today'
              : 'Translation unavailable'
          )
        }
        const decoded = out
          .replace(/&#39;/g, "'")
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
        return {
          title: decoded,
          subtitle: `${languageName(to)} · “${text.slice(0, 60)}”`,
          copyText: decoded
        }
      })
    },

    async 'dev.transform'({ op, text }) {
      const input = text ?? (await clipboard.readText())
      if (!input) throw fail('EMPTY', 'Clipboard is empty — type text after the command')
      const source = text == null ? 'clipboard' : 'text'
      let out
      if (op === 'sha256' || op === 'md5')
        out = crypto.createHash(op).update(input, 'utf8').digest('hex')
      else out = applyTransform(op, input)
      const oneLine = out.replace(/\s+/g, ' ')
      return {
        title: oneLine.length > 90 ? `${oneLine.slice(0, 89)}…` : oneLine,
        subtitle: `${TRANSFORM_LABELS[op]} of ${source}${out.includes('\n') ? ` · ${out.split('\n').length} lines` : ''}`,
        copyText: out
      }
    },

    async 'dev.generate'(spec) {
      const g = generate(spec, {
        rand: (n) => crypto.randomInt(n),
        uuid: () => crypto.randomUUID(),
        now: now()
      })
      const oneLine = g.value.replace(/\s+/g, ' ')
      return {
        title: oneLine.length > 90 ? `${oneLine.slice(0, 89)}…` : oneLine,
        subtitle: `${g.label} · ↵ to copy`,
        copyText: g.value
      }
    },

    async 'meeting.join'() {
      const ev = await calendarNext()
      if (!ev) throw fail('NOT_FOUND', 'No upcoming meeting with a video link today')
      const mins = Math.round((Date.parse(ev.start) - now()) / 60_000)
      const when =
        mins > 1
          ? `starts in ${mins} min`
          : mins >= -1
            ? 'starting now'
            : `started ${-mins} min ago`
      return {
        title: `Join “${ev.title}”`,
        subtitle: `${when} · ${new URL(ev.link).hostname}`,
        url: ev.link
      }
    }
  }

  return {
    has: (id) => id in resolvers,
    resolve: (id, params) => resolvers[id](params)
  }
}
