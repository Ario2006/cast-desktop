import Fuse from 'fuse.js'
import { ACTIONS, getAction, isEnabled, makeSuggestion } from './actionRegistry.js'
import { buildSearchUrl } from './search.js'
import { safe } from './validate.js'

// Actions that need parameters (file.open, app.open, web.*, calc...) only appear via their parsers,
// never as a bare fuzzy-matched command.
const BARE_OK = new Set(ACTIONS.filter((a) => safe(a.paramsSchema, {}).ok).map((a) => a.id))

// Short queries must match tightly ("sig" must not fuzzy-match "session"); longer ones may typo.
const fuseCache = new Map()
const getFuse = (len) => {
  const threshold = len <= 3 ? 0.2 : len <= 5 ? 0.3 : 0.38
  if (!fuseCache.has(threshold)) {
    fuseCache.set(
      threshold,
      new Fuse(ACTIONS, {
        includeScore: true,
        threshold,
        ignoreLocation: true,
        minMatchCharLength: 2,
        keys: [
          { name: 'title', weight: 0.45 },
          { name: 'keywords', weight: 0.4 },
          { name: 'aliases', weight: 0.15 }
        ]
      })
    )
  }
  return fuseCache.get(threshold)
}

/**
 * Tier 1: synchronous local suggestions. Never throws.
 * Returns un-ranked rows with `matchScore` set; pass them through `rank()`.
 *
 * ctx: { now: Date, settings, recording: boolean }
 */
export function localSuggestions(input, ctx) {
  const q = String(input ?? '').trim()
  if (!q) return []
  const rows = []
  const parsedActions = new Set()

  for (const action of ACTIONS) {
    if (!action.parse || !isEnabled(action, ctx.settings, ctx)) continue
    let r = null
    try {
      r = action.parse(q, ctx)
    } catch {
      r = null
    }
    if (!r) continue
    parsedActions.add(action.id)
    rows.push(makeSuggestion(action, r.params, ctx, { matchScore: r.confidence, parsed: true }))
  }

  // Fuzzy command-name matching for actions that did not already parse the input.
  if (q.length >= 1) {
    for (const hit of getFuse(q.length).search(q.toLowerCase(), { limit: 12 })) {
      const action = hit.item
      if (
        parsedActions.has(action.id) ||
        !BARE_OK.has(action.id) ||
        !isEnabled(action, ctx.settings, ctx)
      )
        continue
      // quantized so near-equal matches fall through to action priority (full > area > window)
      const matchScore = Math.round(Math.max(0, 1 - (hit.score ?? 1)) * 0.9 * 10) / 10
      rows.push(
        makeSuggestion(action, {}, ctx, {
          matchScore,
          autocomplete: `${action.aliases?.[0] ?? action.keywords[0]} `
        })
      )
    }
  }

  // Always-available fallback.
  if (!rows.some((r) => r.actionId === 'web.search')) {
    const web = getAction('web.search')
    if (isEnabled(web, ctx.settings, ctx))
      rows.push(makeSuggestion(web, { query: q }, ctx, { matchScore: 0.05, fallback: true }))
  }
  return rows
}

/** Web search URL for a `web.search` row (shared by renderer preview + main executor). */
export const searchUrlFor = (params, settings) =>
  buildSearchUrl(params.engine ?? settings.searchEngine, params.query, settings.customSearchUrl)

/** Convert validated AI intents into suggestion rows. */
export function intentsToSuggestions(intents, ctx) {
  const rows = []
  for (const it of intents) {
    const action = getAction(it.actionId)
    if (!action || !isEnabled(action, ctx.settings, ctx)) continue
    const row = makeSuggestion(action, it.params, ctx, {
      source: 'ai',
      aiConfidence: it.confidence,
      matchScore: 0
    })
    if (it.title) row.title = it.title
    if (it.subtitle) row.subtitle = it.subtitle
    rows.push(row)
  }
  return rows
}

/**
 * True when a deterministic parser already handled the input with high confidence, so the AI
 * round-trip can be skipped (spec §5.1).
 */
export function fullyHandledLocally(rows) {
  return rows.some((r) => r.parsed && r.matchScore >= 0.97)
}
