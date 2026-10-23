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
export function localSuggestions(input, ctx, { chain = true } = {}) {
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
      // Quantized, with a small priority bias, so near-equal matches go to the action people
      // usually mean: full > area > window screenshots, and "timr" means the timer, not the timesheet.
      const raw = Math.max(0, 1 - (hit.score ?? 1)) * 0.9
      const biased = raw + (action.priority - 70) * 0.005 // common actions win near-ties
      // a hit in the middle of a word ("sig" in "insights") is weak evidence: cut it hard
      const ql = q.toLowerCase()
      const startsWord = [action.title, ...(action.keywords ?? []), ...(action.aliases ?? [])].some(
        (t) =>
          t
            .toLowerCase()
            .split(/[\s:.-]+/)
            .some((w) => w.startsWith(ql))
      )
      const matchScore = Math.max(
        0,
        Math.min(0.9, Math.round((startsWord ? biased : biased * 0.3) * 10) / 10)
      )
      rows.push(
        makeSuggestion(action, {}, ctx, {
          matchScore,
          autocomplete: `${action.aliases?.[0] ?? action.keywords[0]} `
        })
      )
    }
  }

  // "remind me to call mom at 5 and book dentist friday 3pm" -> one row that does both
  if (chain) {
    const step = chainRow(q, ctx)
    if (step) rows.push(step)
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

/** Actions that can run as a step of a chained command (each fully specified by its parser). */
export const CHAINABLE = new Set([
  'reminder.create',
  'timer.start',
  'note.create',
  'task.add',
  'calendar.create'
])
const CHAIN_SPLIT =
  /\s+(?:and then|then|and also|and|also)\s+(?=(?:remind|book|schedule|set|start|add|note|jot|todo|task|create|timer|new)\b)|\s*;\s+/i

function chainRow(q, ctx) {
  const parts = q
    .split(CHAIN_SPLIT)
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length < 2 || parts.length > 4) return null
  const steps = []
  for (const part of parts) {
    const best = localSuggestions(part, ctx, { chain: false })
      .filter((r) => r.parsed && CHAINABLE.has(r.actionId) && r.matchScore >= 0.8)
      .sort((a, b) => b.matchScore - a.matchScore)[0]
    if (!best) return null
    steps.push({
      actionId: best.actionId,
      params: best.params,
      title: best.title,
      subtitle: best.subtitle
    })
  }
  const action = getAction('chain.run')
  return action && isEnabled(action, ctx.settings, ctx)
    ? makeSuggestion(action, { steps }, ctx, { matchScore: 0.995, parsed: true })
    : null
}
