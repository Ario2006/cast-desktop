import fs from 'node:fs'
import { convertCurrency } from '../shared/currency.js'

const URL = 'https://api.frankfurter.dev/v1/latest?base=EUR'
const TTL_MS = 6 * 3600_000

const fail = (code, message) => Object.assign(new Error(message), { code })

/**
 * Daily ECB reference rates (EUR base) from frankfurter.dev — no key needed. One request covers
 * every pair. Rates are cached in memory and in `file`, so conversions keep working offline with
 * the last known rates (marked `stale`).
 */
export function createCurrencyService({ file, fetch = globalThis.fetch, now = Date.now, log }) {
  let cache = null // { fetchedAt, date, rates }

  function load() {
    if (cache || !file) return
    try {
      const j = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (j && typeof j.rates === 'object' && Number.isFinite(j.fetchedAt)) cache = j
    } catch {
      /* no cache yet */
    }
  }

  async function refresh() {
    let res
    try {
      res = await fetch(URL, { headers: { Accept: 'application/json' } })
    } catch {
      throw fail('OFFLINE', 'Exchange rates need an internet connection')
    }
    if (!res.ok) throw fail('RATES_UNAVAILABLE', `Rates service returned ${res.status}`)
    const j = await res.json().catch(() => null)
    const rates = j?.rates
    if (
      !rates ||
      typeof rates !== 'object' ||
      !Object.values(rates).every((v) => Number.isFinite(v) && v > 0)
    ) {
      throw fail('RATES_UNAVAILABLE', 'Unexpected rates response')
    }
    cache = { fetchedAt: now(), date: String(j.date ?? ''), rates }
    try {
      if (file) fs.writeFileSync(file, JSON.stringify(cache))
    } catch (e) {
      log?.warn('could not persist rates', e)
    }
    return cache
  }

  async function ensure() {
    load()
    if (cache && now() - cache.fetchedAt < TTL_MS) return { ...cache, stale: false }
    try {
      return { ...(await refresh()), stale: false }
    } catch (e) {
      if (cache) return { ...cache, stale: true } // offline: fall back to the last known rates
      throw e
    }
  }

  return {
    async convert(amount, from, to) {
      const { rates, date, stale } = await ensure()
      const r = convertCurrency(amount, from, to, rates)
      if (!r) throw fail('UNSUPPORTED', `No rate for ${from} → ${to}`)
      return { ...r, date, stale }
    }
  }
}
