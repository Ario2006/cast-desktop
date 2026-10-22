/** Currencies served by the ECB-backed rates API (frankfurter) plus the EUR base. */
export const CURRENCIES = new Set(
  'AUD BGN BRL CAD CHF CNY CZK DKK EUR GBP HKD HUF IDR ILS INR ISK JPY KRW MXN MYR NOK NZD PHP PLN RON SEK SGD THB TRY USD ZAR'.split(
    ' '
  )
)

const SYMBOLS = { $: 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR', '₩': 'KRW', '₺': 'TRY' }
const NAMES = {
  dollar: 'USD', dollars: 'USD', buck: 'USD', bucks: 'USD', euro: 'EUR', euros: 'EUR', pound: 'GBP',
  pounds: 'GBP', sterling: 'GBP', yen: 'JPY', rupee: 'INR', rupees: 'INR', franc: 'CHF', francs: 'CHF',
  yuan: 'CNY', rmb: 'CNY', won: 'KRW', peso: 'MXN', pesos: 'MXN', rand: 'ZAR', lira: 'TRY', baht: 'THB'
} // prettier-ignore

const code = (token) => {
  const t = token.trim()
  if (SYMBOLS[t]) return SYMBOLS[t]
  const l = t.toLowerCase()
  if (NAMES[l]) return NAMES[l]
  const u = t.toUpperCase()
  return /^[A-Z]{3}$/.test(u) && CURRENCIES.has(u) ? u : null
}

const NUM = '(\\d+(?:[.,]\\d+)*|\\.\\d+)'
const CCY = '([A-Za-z]{2,10}|[$€£¥₹₩₺])'
const RE = new RegExp(
  `^(?:([$€£¥₹₩₺])\\s*)?(?:${NUM}\\s*)?${CCY}?\\s*(?:to|in|into|as|->|=>|=)\\s*${CCY}$`,
  'i'
)

/**
 * "100 usd to eur", "$50 in inr", "50 euros to dollars", "usd to eur" -> { amount, from, to } | null.
 * Only fires when both sides are real currencies, so unit conversions ("5 cups to ml") never match.
 */
export function parseCurrency(input) {
  const m = String(input).trim().match(RE)
  if (!m) return null
  const [, symbol, num, fromToken, toToken] = m
  const from = symbol ? SYMBOLS[symbol] : fromToken ? code(fromToken) : null
  const to = code(toToken)
  if (!from || !to || from === to) return null
  const amount = num ? Number(num.replace(/,(?=\d{3}\b)/g, '').replace(',', '.')) : 1
  if (!Number.isFinite(amount) || amount < 0 || amount > 1e12) return null
  return { amount, from, to }
}

/** Convert through the EUR-based table: `rates` is { CODE: perEuro } (EUR implied as 1). */
export function convertCurrency(amount, from, to, rates) {
  const rate = (c) => (c === 'EUR' ? 1 : rates?.[c])
  const rf = rate(from)
  const rt = rate(to)
  if (!rf || !rt) return null
  return { value: (amount * rt) / rf, rate: rt / rf }
}

export function formatMoney(value, ccy) {
  const digits = ccy === 'JPY' || ccy === 'KRW' || ccy === 'IDR' || ccy === 'HUF' ? 0 : 2
  return `${value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${ccy}`
}
