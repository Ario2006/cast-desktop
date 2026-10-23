/** City / abbreviation -> IANA zone. Abbreviations map to the zone people usually mean. */
export const ZONES = {
  // abbreviations
  utc: 'UTC', gmt: 'UTC', z: 'UTC',
  pst: 'America/Los_Angeles', pdt: 'America/Los_Angeles', pt: 'America/Los_Angeles', pacific: 'America/Los_Angeles',
  mst: 'America/Denver', mdt: 'America/Denver', mt: 'America/Denver', mountain: 'America/Denver',
  cst: 'America/Chicago', cdt: 'America/Chicago', ct: 'America/Chicago', central: 'America/Chicago',
  est: 'America/New_York', edt: 'America/New_York', et: 'America/New_York', eastern: 'America/New_York',
  bst: 'Europe/London', cet: 'Europe/Paris', cest: 'Europe/Paris', eet: 'Europe/Athens',
  ist: 'Asia/Kolkata', jst: 'Asia/Tokyo', kst: 'Asia/Seoul', sgt: 'Asia/Singapore', hkt: 'Asia/Hong_Kong',
  aest: 'Australia/Sydney', aedt: 'Australia/Sydney', awst: 'Australia/Perth', nzst: 'Pacific/Auckland', nzdt: 'Pacific/Auckland',
  pkt: 'Asia/Karachi', gst: 'Asia/Dubai', wib: 'Asia/Jakarta', brt: 'America/Sao_Paulo', hst: 'Pacific/Honolulu', akst: 'America/Anchorage',
  // cities & countries
  'san francisco': 'America/Los_Angeles', sf: 'America/Los_Angeles', 'los angeles': 'America/Los_Angeles', la: 'America/Los_Angeles',
  seattle: 'America/Los_Angeles', vancouver: 'America/Vancouver', denver: 'America/Denver', phoenix: 'America/Phoenix',
  chicago: 'America/Chicago', austin: 'America/Chicago', dallas: 'America/Chicago', houston: 'America/Chicago', 'mexico city': 'America/Mexico_City',
  'new york': 'America/New_York', nyc: 'America/New_York', ny: 'America/New_York', boston: 'America/New_York', miami: 'America/New_York',
  washington: 'America/New_York', toronto: 'America/Toronto', montreal: 'America/Toronto', 'sao paulo': 'America/Sao_Paulo',
  'buenos aires': 'America/Argentina/Buenos_Aires', bogota: 'America/Bogota', lima: 'America/Lima', santiago: 'America/Santiago',
  honolulu: 'Pacific/Honolulu', hawaii: 'Pacific/Honolulu', anchorage: 'America/Anchorage',
  london: 'Europe/London', uk: 'Europe/London', dublin: 'Europe/Dublin', lisbon: 'Europe/Lisbon', paris: 'Europe/Paris',
  berlin: 'Europe/Berlin', germany: 'Europe/Berlin', amsterdam: 'Europe/Amsterdam', brussels: 'Europe/Brussels', madrid: 'Europe/Madrid',
  barcelona: 'Europe/Madrid', rome: 'Europe/Rome', milan: 'Europe/Rome', zurich: 'Europe/Zurich', vienna: 'Europe/Vienna',
  stockholm: 'Europe/Stockholm', oslo: 'Europe/Oslo', copenhagen: 'Europe/Copenhagen', helsinki: 'Europe/Helsinki',
  warsaw: 'Europe/Warsaw', prague: 'Europe/Prague', athens: 'Europe/Athens', istanbul: 'Europe/Istanbul', moscow: 'Europe/Moscow',
  kyiv: 'Europe/Kyiv', cairo: 'Africa/Cairo', lagos: 'Africa/Lagos', nairobi: 'Africa/Nairobi', johannesburg: 'Africa/Johannesburg',
  dubai: 'Asia/Dubai', uae: 'Asia/Dubai', riyadh: 'Asia/Riyadh', 'tel aviv': 'Asia/Jerusalem', tehran: 'Asia/Tehran', karachi: 'Asia/Karachi',
  india: 'Asia/Kolkata', delhi: 'Asia/Kolkata', 'new delhi': 'Asia/Kolkata', mumbai: 'Asia/Kolkata', bangalore: 'Asia/Kolkata',
  bengaluru: 'Asia/Kolkata', chennai: 'Asia/Kolkata', kolkata: 'Asia/Kolkata', hyderabad: 'Asia/Kolkata', pune: 'Asia/Kolkata',
  kathmandu: 'Asia/Kathmandu', dhaka: 'Asia/Dhaka', bangkok: 'Asia/Bangkok', jakarta: 'Asia/Jakarta', singapore: 'Asia/Singapore',
  'kuala lumpur': 'Asia/Kuala_Lumpur', manila: 'Asia/Manila', 'hong kong': 'Asia/Hong_Kong', shanghai: 'Asia/Shanghai',
  beijing: 'Asia/Shanghai', china: 'Asia/Shanghai', shenzhen: 'Asia/Shanghai', taipei: 'Asia/Taipei', seoul: 'Asia/Seoul',
  korea: 'Asia/Seoul', tokyo: 'Asia/Tokyo', japan: 'Asia/Tokyo', osaka: 'Asia/Tokyo', sydney: 'Australia/Sydney',
  melbourne: 'Australia/Melbourne', brisbane: 'Australia/Brisbane', perth: 'Australia/Perth', auckland: 'Pacific/Auckland'
} // prettier-ignore

export const resolveZone = (name) => {
  const k = String(name).trim().toLowerCase().replace(/\s+/g, ' ')
  if (k === 'local' || k === 'here' || k === 'my time')
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  return ZONES[k] ?? null
}

/** Minutes east of UTC for `zone` at instant `date`. */
export function zoneOffsetMinutes(zone, date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(date).map((p) => [p.type, p.value])
  ) // prettier-ignore
  const asUtc = Date.UTC(
    +parts.year,
    +parts.month - 1,
    +parts.day,
    +parts.hour,
    +parts.minute,
    +parts.second
  )
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000)
}

/** Wall-clock time in `zone` on the zone's current date -> Date instant. */
function wallTimeToInstant(zone, hours, minutes, now) {
  const today = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  )
  const guess = Date.UTC(+today.year, +today.month - 1, +today.day, hours, minutes)
  const off = zoneOffsetMinutes(zone, new Date(guess))
  return new Date(guess - off * 60000)
}

const fmtTime = (date, zone) =>
  new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' }).format(
    date
  )
const fmtDay = (date, zone) =>
  new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short' }).format(date)
const zoneLabel = (name) =>
  name.length <= 4 ? name.toUpperCase() : name.replace(/\b\w/g, (c) => c.toUpperCase())

/**
 * "time in tokyo" | "tokyo time" | "what time is it in london"  -> current time there
 * "3pm pst in ist" | "15:30 london to new york" | "9am in tokyo" -> converted wall time
 * -> { title, subtitle, copyText } | null
 */
export function worldClock(input, now = new Date()) {
  const t = String(input)
    .trim()
    .toLowerCase()
    .replace(/[?.!]$/, '')
  let m
  if (
    (m = t.match(
      /^(?:what(?:'s| is)? the time|what time is it|current time|time)(?: now)? in ([a-z .]+)$/
    )) ||
    (m = t.match(/^([a-z .]+?) time$/))
  ) {
    const zone = resolveZone(m[1])
    if (!zone) return null
    const time = fmtTime(now, zone)
    const local = Intl.DateTimeFormat().resolvedOptions().timeZone
    const diff = (zoneOffsetMinutes(zone, now) - zoneOffsetMinutes(local, now)) / 60
    const rel = diff === 0 ? 'same as you' : `${diff > 0 ? '+' : ''}${diff} h from you`
    return {
      title: `${time} in ${zoneLabel(m[1])}`,
      subtitle: `${fmtDay(now, zone)} · ${zone} · ${rel}`,
      copyText: time
    }
  }
  const TIME = '(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?'
  const re = new RegExp(`^${TIME}\\s+([a-z .]+?)\\s+(?:in|to|as)\\s+([a-z .]+)$`)
  const re2 = new RegExp(`^${TIME}\\s+(?:in|to)\\s+([a-z .]+)$`)
  let fromName
  let toName
  let h
  let mi
  let ap
  if ((m = t.match(re))) [, h, mi, ap, fromName, toName] = m
  else if ((m = t.match(re2))) [, h, mi, ap, toName] = m
  else return null
  const fromZone = fromName
    ? resolveZone(fromName)
    : Intl.DateTimeFormat().resolvedOptions().timeZone
  const toZone = resolveZone(toName)
  if (!fromZone || !toZone) return null
  let hours = Number(h)
  const minutes = Number(mi ?? 0)
  if (hours > 23 || minutes > 59 || (ap && (hours < 1 || hours > 12))) return null
  if (ap === 'pm' && hours < 12) hours += 12
  if (ap === 'am' && hours === 12) hours = 0
  if (!ap && !mi && hours > 0 && hours < 13 && !/^\d{2}/.test(h)) {
    /* "3 pst in ist" without am/pm is ambiguous; keep 24h reading */
  }
  const instant = wallTimeToInstant(fromZone, hours, minutes, now)
  const fromDay = fmtDay(instant, fromZone)
  const toDay = fmtDay(instant, toZone)
  const out = fmtTime(instant, toZone)
  return {
    title: `${fmtTime(instant, fromZone)} ${fromName ? zoneLabel(fromName) : 'your time'} = ${out} ${zoneLabel(toName)}${toDay !== fromDay ? ` (${toDay})` : ''}`,
    subtitle: `${fromZone} → ${toZone}`,
    copyText: out
  }
}
