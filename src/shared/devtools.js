import cronstrue from 'cronstrue'

// ---------------------------------------------------------------------------------------------
// Text transforms: "base64 hello", "b64d aGk=", "slug Hello World", "json {…}", "upper x"…
// With no text after the op, the transform applies to the clipboard (resolved in main).

const OPS = {
  base64: ['base64', 'b64', 'base64 encode', 'b64e'],
  base64decode: ['base64 decode', 'b64d', 'unbase64', 'decode base64'],
  urlencode: ['urlencode', 'url encode', 'encodeuri', 'urlenc'],
  urldecode: ['urldecode', 'url decode', 'decodeuri', 'urldec'],
  json: ['json', 'json format', 'pretty json', 'format json'],
  jsonmin: ['json minify', 'minify json', 'jsonmin'],
  slug: ['slug', 'slugify'],
  upper: ['upper', 'uppercase'],
  lower: ['lower', 'lowercase'],
  title: ['title case', 'titlecase'],
  camel: ['camel', 'camelcase', 'camel case'],
  snake: ['snake', 'snakecase', 'snake case'],
  kebab: ['kebab', 'kebabcase', 'kebab case'],
  trim: ['trim', 'strip'],
  count: ['count', 'word count', 'wc'],
  sha256: ['sha256', 'sha 256'],
  md5: ['md5'],
  reverse: ['reverse']
}
const OP_NAMES = Object.entries(OPS)
  .flatMap(([op, names]) => names.map((n) => [n, op]))
  .sort((a, b) => b[0].length - a[0].length) // longest alias first ("base64 decode" before "base64")

export const TRANSFORM_LABELS = {
  base64: 'Base64 encode', base64decode: 'Base64 decode', urlencode: 'URL encode', urldecode: 'URL decode',
  json: 'Format JSON', jsonmin: 'Minify JSON', slug: 'Slugify', upper: 'UPPERCASE', lower: 'lowercase',
  title: 'Title Case', camel: 'camelCase', snake: 'snake_case', kebab: 'kebab-case', trim: 'Trim',
  count: 'Count', sha256: 'SHA-256', md5: 'MD5', reverse: 'Reverse'
} // prettier-ignore

/** "base64 hello" -> { op: 'base64', text: 'hello' };  "slug" -> { op: 'slug' } (clipboard) */
export function parseTransform(input) {
  const t = String(input).trimStart()
  const lower = t.toLowerCase()
  for (const [name, op] of OP_NAMES) {
    if (lower === name) return name === 'json' ? null : { op } // bare "json" opens the scratchpad
    if (lower.startsWith(`${name} `) || lower.startsWith(`${name}:`)) {
      const text = t.slice(name.length + 1).replace(/^\s+/, '')
      return text ? { op, text } : { op }
    }
  }
  return null
}

const words = (s) =>
  s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)

const utf8ToB64 = (s) => {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}
const b64ToUtf8 = (s) => {
  const bin = atob(s.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/'))
  return new TextDecoder('utf-8', { fatal: true }).decode(
    Uint8Array.from(bin, (c) => c.charCodeAt(0))
  )
}

/** Pure transforms (hashes are done in main with node:crypto). Throws Error with a friendly message. */
export function applyTransform(op, text) {
  const s = String(text)
  switch (op) {
    case 'base64': return utf8ToB64(s)
    case 'base64decode':
      try { return b64ToUtf8(s.trim()) } catch { throw new Error('That isn’t valid Base64') }
    case 'urlencode': return encodeURIComponent(s)
    case 'urldecode':
      try { return decodeURIComponent(s.replace(/\+/g, ' ')) } catch { throw new Error('That isn’t valid URL encoding') }
    case 'json':
    case 'jsonmin': {
      let v
      try { v = JSON.parse(s) } catch (e) { throw new Error(`Invalid JSON: ${e.message}`) }
      return op === 'json' ? JSON.stringify(v, null, 2) : JSON.stringify(v)
    }
    case 'slug':
      return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    case 'upper': return s.toUpperCase()
    case 'lower': return s.toLowerCase()
    case 'title': return s.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase())
    case 'camel': return words(s).map((w, i) => (i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join('')
    case 'snake': return words(s).map((w) => w.toLowerCase()).join('_')
    case 'kebab': return words(s).map((w) => w.toLowerCase()).join('-')
    case 'trim': return s.trim()
    case 'reverse': return [...s].reverse().join('')
    case 'count': {
      const w = s.trim() ? s.trim().split(/\s+/).length : 0
      const lines = s ? s.split('\n').length : 0
      return `${w} words · ${[...s].length} characters · ${lines} lines`
    }
    default: throw new Error(`Unknown transform "${op}"`)
  }
} // prettier-ignore

// ---------------------------------------------------------------------------------------------
// Generators: "uuid", "password 24", "lorem 3", "timestamp", "epoch 1700000000", "random 1-100"

export function parseGenerator(input) {
  const t = String(input).trim().toLowerCase()
  let m
  if (/^(?:uuid|guid|uuid4|new uuid)$/.test(t)) return { kind: 'uuid' }
  if ((m = t.match(/^(?:password|pass|pw|passgen)(?:\s+(\d{1,3}))?(\s+(?:no symbols|simple))?$/))) {
    const length = Math.min(128, Math.max(6, Number(m[1] ?? 20)))
    return { kind: 'password', length, symbols: !m[2] }
  }
  if (
    (m = t.match(
      /^(?:lorem|lorem ipsum|ipsum)(?:\s+(\d{1,2}))?(?:\s+(words?|sentences?|paragraphs?))?$/
    ))
  ) {
    return {
      kind: 'lorem',
      count: Math.min(20, Math.max(1, Number(m[1] ?? 1))),
      unit: (m[2] ?? 'paragraph').replace(/s$/, '')
    }
  }
  if (/^(?:timestamp|now|unix time|epoch now|current time iso|iso now)$/.test(t))
    return { kind: 'now' }
  if (
    (m = t.match(/^(?:epoch|unix|ts|timestamp)\s+(-?\d{9,13})$/)) ||
    (m = t.match(/^(\d{10}|\d{13})$/))
  ) {
    return { kind: 'epoch', value: Number(m[1]) }
  }
  if ((m = t.match(/^(?:random|rand|rng)(?:\s+(-?\d+)\s*(?:-|to|\.\.)\s*(-?\d+))?$/))) {
    const lo = Number(m[1] ?? 1)
    const hi = Number(m[2] ?? 100)
    return { kind: 'random', min: Math.min(lo, hi), max: Math.max(lo, hi) }
  }
  if (/^(?:coin|flip a coin|coin flip|heads or tails)$/.test(t)) return { kind: 'coin' }
  return null
}

const LOREM =
  'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum'.split(
    ' '
  )

/** `rand(n)` -> integer in [0, n). Injected so tests are deterministic and main can use crypto. */
export function generate(
  spec,
  { rand = (n) => Math.floor(Math.random() * n), now = Date.now(), uuid } = {}
) {
  const pick = (arr) => arr[rand(arr.length)]
  switch (spec.kind) {
    case 'uuid':
      return { value: uuid ? uuid() : crypto.randomUUID(), label: 'UUID v4' }
    case 'password': {
      const sets = [
        'abcdefghijkmnopqrstuvwxyz',
        'ABCDEFGHJKLMNPQRSTUVWXYZ',
        '23456789',
        ...(spec.symbols ? ['!@#$%^&*-_=+?'] : [])
      ]
      const all = sets.join('')
      // guarantee one of each class, then fill and shuffle
      const chars = sets
        .map(pick)
        .concat(Array.from({ length: spec.length - sets.length }, () => pick(all)))
      for (let i = chars.length - 1; i > 0; i--) {
        const j = rand(i + 1)
        ;[chars[i], chars[j]] = [chars[j], chars[i]]
      }
      return { value: chars.join(''), label: `${spec.length}-character password` }
    }
    case 'lorem': {
      const sentence = () => {
        const n = 8 + rand(8)
        const w = Array.from({ length: n }, () => pick(LOREM)).join(' ')
        return `${w[0].toUpperCase()}${w.slice(1)}.`
      }
      const paragraph = () => Array.from({ length: 4 + rand(3) }, sentence).join(' ')
      const value =
        spec.unit === 'word'
          ? Array.from({ length: spec.count }, () => pick(LOREM)).join(' ')
          : spec.unit === 'sentence'
            ? Array.from({ length: spec.count }, sentence).join(' ')
            : Array.from({ length: spec.count }, paragraph).join('\n\n')
      return {
        value,
        label: `Lorem ipsum · ${spec.count} ${spec.unit}${spec.count > 1 ? 's' : ''}`
      }
    }
    case 'now':
      return {
        value: String(Math.floor(now / 1000)),
        label: `Unix time · ${new Date(now).toISOString()}`
      }
    case 'epoch': {
      const ms = spec.value > 1e11 ? spec.value : spec.value * 1000
      const d = new Date(ms)
      return { value: d.toISOString(), label: `${d.toLocaleString()} (local)` }
    }
    case 'random':
      return {
        value: String(spec.min + rand(spec.max - spec.min + 1)),
        label: `Random number ${spec.min}–${spec.max}`
      }
    case 'coin':
      return { value: rand(2) ? 'Heads' : 'Tails', label: 'Coin flip' }
    default:
      throw new Error('Unknown generator')
  }
}

// ---------------------------------------------------------------------------------------------
// Number base, CSS unit and colour conversions (synchronous, shown as live rows)

const fmtBase = { hex: (n) => `0x${n.toString(16).toUpperCase()}`, binary: (n) => `0b${n.toString(2)}`, octal: (n) => `0o${n.toString(8)}`, decimal: (n) => String(n) } // prettier-ignore
const BASE_WORD = { hex: 'hex', hexadecimal: 'hex', bin: 'binary', binary: 'binary', oct: 'octal', octal: 'octal', dec: 'decimal', decimal: 'decimal' } // prettier-ignore

function parseInteger(token) {
  const t = token.trim().toLowerCase().replace(/_/g, '')
  if (/^0x[0-9a-f]+$/.test(t)) return { n: parseInt(t.slice(2), 16), from: 'hex' }
  if (/^0b[01]+$/.test(t)) return { n: parseInt(t.slice(2), 2), from: 'binary' }
  if (/^0o[0-7]+$/.test(t)) return { n: parseInt(t.slice(2), 8), from: 'octal' }
  if (/^\d+$/.test(t)) return { n: Number(t), from: 'decimal' }
  return null
}

const hex2 = (n) => n.toString(16).padStart(2, '0')
function rgbToHsl(r, g, b) {
  ;[r, g, b] = [r / 255, g / 255, b / 255]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    h *= 60
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)]
}
function hslToRgb(h, s, l) {
  s /= 100
  l /= 100
  const k = (n) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)]
}

/** Parse a CSS colour (#rgb, #rrggbb, rgb(), hsl()) -> [r,g,b] | null */
export function parseColor(input) {
  const t = String(input).trim().toLowerCase()
  let m
  if ((m = t.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/)) && (t.startsWith('#') || /[a-f]/.test(m[1]))) {
    const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  }
  if (
    (m = t.match(
      /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/
    ))
  ) {
    const c = m.slice(1, 4).map(Number)
    return c.every((v) => v <= 255) ? c : null
  }
  if (
    (m = t.match(
      /^hsla?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})%\s*[, ]\s*(\d{1,3})%\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/
    ))
  ) {
    return hslToRgb(Number(m[1]) % 360, Math.min(100, Number(m[2])), Math.min(100, Number(m[3])))
  }
  return null
}

export function describeColor([r, g, b]) {
  const [h, s, l] = rgbToHsl(r, g, b)
  return {
    hex: `#${hex2(r)}${hex2(g)}${hex2(b)}`.toUpperCase(),
    rgb: `rgb(${r}, ${g}, ${b})`,
    hsl: `hsl(${h}, ${s}%, ${l}%)`
  }
}

/**
 * "0xff" -> 255 · "255 to hex" · "1010 in binary"? (decimal input) · "16px to rem" · "1.5rem in px"
 * "#ff8800" / "#ff8800 to rgb" / "rgb(255,0,0) to hex"
 * -> { title, copyText, subtitle } | null
 */
export function devConvert(input, { remBase = 16 } = {}) {
  const t = String(input).trim()
  let m
  // CSS units
  if ((m = t.match(/^(\d+(?:\.\d+)?)\s*(px|rem|em)\s+(?:to|in|as)\s+(px|rem|em)$/i))) {
    const [v, from, to] = [Number(m[1]), m[2].toLowerCase(), m[3].toLowerCase()]
    if (from === to) return null
    const px = from === 'px' ? v : v * remBase
    const out = to === 'px' ? px : px / remBase
    const s = `${Number(out.toFixed(4))}${to}`
    return { title: `= ${s}`, copyText: s, subtitle: `${v}${from} at ${remBase}px base` }
  }
  // colours
  const colorPart = t.replace(/\s+(?:to|in|as)\s+(hex|rgb|hsl)$/i, '')
  const target = t.match(/\s+(?:to|in|as)\s+(hex|rgb|hsl)$/i)?.[1]?.toLowerCase()
  const rgb = parseColor(colorPart)
  if (rgb) {
    const d = describeColor(rgb)
    const key =
      target ?? (colorPart.startsWith('#') || /^[0-9a-f]{6}$/i.test(colorPart) ? 'rgb' : 'hex')
    return {
      title: `= ${d[key]}`,
      copyText: d[key],
      subtitle: `${d.hex} · ${d.rgb} · ${d.hsl}`,
      color: d.hex
    }
  }
  // number bases
  if (
    (m = t.match(/^(\S+)\s+(?:to|in|as)\s+(hex|hexadecimal|bin|binary|oct|octal|dec|decimal)$/i))
  ) {
    const p = parseInteger(m[1])
    if (!p || !Number.isSafeInteger(p.n)) return null
    const to = BASE_WORD[m[2].toLowerCase()]
    const s = fmtBase[to](p.n)
    return {
      title: `= ${s}`,
      copyText: to === 'decimal' ? String(p.n) : s,
      subtitle: `${m[1]} (${p.from}) in ${to}`
    }
  }
  if ((m = t.match(/^(0x[0-9a-f_]+|0b[01_]+|0o[0-7_]+)$/i))) {
    const p = parseInteger(m[1])
    if (!p || !Number.isSafeInteger(p.n)) return null
    return {
      title: `= ${p.n}`,
      copyText: String(p.n),
      subtitle: `${fmtBase.hex(p.n)} · ${fmtBase.binary(p.n)} · ${fmtBase.octal(p.n)}`
    }
  }
  return null
}

// "cron 0 9 * * 1-5" -> human explanation | null
export function explainCron(input) {
  const m = String(input)
    .trim()
    .match(/^cron\s+(.+)$/i)
  if (!m) return null
  try {
    return {
      title: cronstrue.toString(m[1].trim(), { use24HourTimeFormat: false }),
      expression: m[1].trim()
    }
  } catch {
    return { title: 'Not a valid cron expression', expression: m[1].trim(), invalid: true }
  }
}
