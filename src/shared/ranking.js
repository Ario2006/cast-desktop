import { MAX_SUGGESTIONS } from './constants.js'

export const WEIGHTS = { match: 0.5, ai: 0.3, recency: 0.1, frequency: 0.1 }
const RECENCY_HALF_LIFE_MS = 3 * 86_400_000

/**
 * score = 0.5·match + 0.3·aiConfidence + 0.1·recency + 0.1·frequency
 * `stats` is { [actionId]: { count, lastUsed } } from action history (may be empty).
 */
export function scoreSuggestion(s, stats = {}, now = Date.now()) {
  const st = stats[s.actionId]
  const recency = st?.lastUsed
    ? Math.exp(-((now - st.lastUsed) / RECENCY_HALF_LIFE_MS) * Math.LN2)
    : 0
  const frequency = st?.count ? Math.min(1, Math.log2(1 + st.count) / 6) : 0
  return (
    WEIGHTS.match * (s.matchScore ?? 0) +
    WEIGHTS.ai * (s.aiConfidence ?? 0) +
    WEIGHTS.recency * recency +
    WEIGHTS.frequency * frequency
  )
}

/** Merge duplicate rows (same actionId+params), score, sort, and cap. */
export function rank(list, { stats = {}, now = Date.now(), max = MAX_SUGGESTIONS } = {}) {
  const merged = new Map()
  for (const s of list) {
    const prev = merged.get(s.key)
    if (!prev) {
      merged.set(s.key, { ...s })
      continue
    }
    prev.matchScore = Math.max(prev.matchScore, s.matchScore)
    prev.aiConfidence = Math.max(prev.aiConfidence, s.aiConfidence)
    // prefer the AI's richer title when it has one; keep local params otherwise
    if (s.source === 'ai' && s.title) {
      prev.title = s.title
      prev.subtitle = s.subtitle ?? prev.subtitle
    }
  }
  return [...merged.values()]
    .map((s) => ({ ...s, score: scoreSuggestion(s, stats, now) }))
    .sort((a, b) => b.score - a.score || b.priority - a.priority)
    .slice(0, max)
}
