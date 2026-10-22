import {
  absDependencies,
  acosDependencies,
  addDependencies,
  asinDependencies,
  atanDependencies,
  cbrtDependencies,
  ceilDependencies,
  cosDependencies,
  create,
  divideDependencies,
  eDependencies,
  evaluateDependencies,
  expDependencies,
  floorDependencies,
  log10Dependencies,
  log2Dependencies,
  logDependencies,
  maxDependencies,
  minDependencies,
  modDependencies,
  multiplyDependencies,
  piDependencies,
  powDependencies,
  roundDependencies,
  signDependencies,
  sinDependencies,
  sqrtDependencies,
  subtractDependencies,
  tanDependencies,
  unaryMinusDependencies,
  unaryPlusDependencies,
  unitDependencies,
  numberDependencies
} from 'mathjs'

// Sandboxed mathjs, built from only the functions a launcher calculator needs (keeps the
// renderer bundle small). The dangerous ones — import/createUnit/evaluate/parse/simplify/… —
// are replaced with throwing stubs after the real evaluator has been captured.
const math = create({
  absDependencies, acosDependencies, addDependencies, asinDependencies, atanDependencies,
  cbrtDependencies, ceilDependencies, cosDependencies, divideDependencies, eDependencies,
  evaluateDependencies, expDependencies, floorDependencies, log10Dependencies,
  log2Dependencies, logDependencies, maxDependencies, minDependencies, modDependencies,
  multiplyDependencies, piDependencies, powDependencies, roundDependencies, signDependencies,
  sinDependencies, sqrtDependencies, subtractDependencies, tanDependencies, unaryMinusDependencies,
  unaryPlusDependencies, unitDependencies, numberDependencies
}) // prettier-ignore
const evaluateRaw = math.evaluate.bind(math)
const blocked = () => {
  throw new Error('Function is disabled')
}
math.import(
  {
    import: blocked,
    createUnit: blocked,
    evaluate: blocked,
    parse: blocked,
    simplify: blocked,
    derivative: blocked,
    resolve: blocked,
    reviver: blocked
  },
  { override: true }
)

const MAX_LEN = 200
const ALLOWED_WORDS = new Set([
  'sqrt', 'cbrt', 'abs', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'log', 'ln', 'log10',
  'log2', 'exp', 'round', 'floor', 'ceil', 'min', 'max', 'pow', 'pi', 'e', 'mod', 'sign'
]) // prettier-ignore

function normalize(input) {
  let t = String(input).trim()
  t = t.replace(/^(?:calc(?:ulate)?\s+|=\s*)/i, '')
  t = t.replace(/(\d),(?=\d{3}\b)/g, '$1') // 1,000 -> 1000
  t = t
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/\bln\b/gi, 'log')
  // "15% of 240" -> (15/100) * (240)
  const pct = t.match(/^(\d+(?:\.\d+)?)\s*%\s*of\s+(.+)$/i)
  if (pct) t = `(${pct[1]}/100) * (${pct[2]})`
  return t
}

/** Cheap pre-check so we only hand plausible expressions to mathjs. */
export function looksLikeMath(input) {
  const raw = String(input).trim()
  if (!raw || raw.length > MAX_LEN) return false
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(raw)) return false // ISO date, not subtraction
  const t = normalize(raw)
  const words = t.match(/[a-z_]+/gi) ?? []
  if (words.some((w) => !ALLOWED_WORDS.has(w.toLowerCase()))) return false
  if (!/[\d]|pi|\be\b/i.test(t)) return false
  if (!/^[\d\s+\-*/^%().,a-z_]+$/i.test(t)) return false
  // needs an operator, or a function call — a bare number/constant is not a calculation
  const hasOp = /[+*/^%]/.test(t) || /\d\s*-\s*\d|\)\s*-|-\s*\(/.test(t)
  const hasCall = /[a-z]\s*\(/i.test(t)
  return hasOp || hasCall
}

export function formatNumber(n) {
  if (!Number.isFinite(n)) return String(n)
  const abs = Math.abs(n)
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-9)) return n.toExponential(8).replace(/\.?0+e/, 'e')
  return String(Number.parseFloat(n.toPrecision(12)))
}

/** Evaluate a math expression. Returns { value, display } or null if not a valid, finite number. */
export function evaluateMath(input) {
  if (!looksLikeMath(input)) return null
  try {
    let v = evaluateRaw(normalize(input), {})
    if (v && typeof v.toNumber === 'function') v = v.toNumber()
    if (typeof v !== 'number' || !Number.isFinite(v)) return null
    return { value: v, display: formatNumber(v) }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------------------------
// Units

const UNIT_ALIASES = {
  f: 'degF', fahrenheit: 'degF', '°f': 'degF', degf: 'degF',
  c: 'degC', celsius: 'degC', centigrade: 'degC', '°c': 'degC', degc: 'degC',
  k: 'K', kelvin: 'K',
  kmh: 'km/h', kph: 'km/h', 'km/hr': 'km/h',
  mph: 'mile/hour',
  lbs: 'lb', pounds: 'lb', pound: 'lb',
  oz: 'oz', ounces: 'oz', ounce: 'oz',
  kg: 'kg', kgs: 'kg', kilos: 'kg', kilo: 'kg',
  cups: 'cup', cup: 'cup',
  tbsp: 'tablespoon', tsp: 'teaspoon',
  gal: 'gallon', gallons: 'gallon',
  l: 'liter', liters: 'liter', litres: 'liter', litre: 'liter',
  ml: 'milliliter', milliliters: 'milliliter',
  ft: 'ft', feet: 'ft', foot: 'ft',
  in: 'inch', inches: 'inch', inch: 'inch',
  yd: 'yard', yards: 'yard',
  mi: 'mile', miles: 'mile',
  km: 'km', kms: 'km', kilometers: 'km', kilometres: 'km',
  m: 'm', meters: 'm', metres: 'm',
  cm: 'cm', mm: 'mm',
  g: 'gram', grams: 'gram',
  mb: 'MB', gb: 'GB', tb: 'TB', kb: 'kB'
} // prettier-ignore

const TEMP_LABEL = { degF: '°F', degC: '°C', K: 'K' }
const NUM = '[-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[-+]?\\d+)?'
const UNIT_RE = new RegExp(
  `^(${NUM})\\s*°?\\s*([a-z°µ/][a-z°µ/ ^0-9²³]*?)\\s+(?:to|in|into|as|->|=>)\\s+°?\\s*([a-z°µ/][a-z°µ/ ^0-9²³]*)$`,
  'i'
)

const toMathUnit = (token) => {
  const key = token
    .trim()
    .toLowerCase()
    .replace(/^deg(?=[fc]$)/, '')
  return UNIT_ALIASES[key] ?? UNIT_ALIASES[token.trim().toLowerCase()] ?? token.trim()
}

/** "5 miles in km" -> { value, display, text } or null. */
export function convertUnits(input) {
  const raw = String(input).trim()
  if (raw.length > MAX_LEN) return null
  const m = raw.match(UNIT_RE)
  if (!m) return null
  const [, amount, fromToken, toToken] = m
  const fromUnit = toMathUnit(fromToken)
  const toUnit = toMathUnit(toToken)
  try {
    const u = math.unit(Number(amount), fromUnit)
    const value = u.toNumber(toUnit)
    if (!Number.isFinite(value)) return null
    const label = TEMP_LABEL[toUnit] ?? toToken.trim()
    const sep = TEMP_LABEL[toUnit] && toUnit !== 'K' ? '' : ' '
    const display = formatNumber(value)
    return {
      value,
      display,
      text: `${display}${sep}${label}`,
      from: `${amount} ${fromToken.trim()}`
    }
  } catch {
    return null
  }
}
