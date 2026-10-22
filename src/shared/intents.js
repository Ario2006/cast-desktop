import { AI_MAX_INTENTS } from './constants.js'
import { getAction } from './actionRegistry.js'

/** Extract a JSON object from model output (tolerates code fences and stray prose). */
export function extractJson(text) {
  if (typeof text !== 'string') return null
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
  try {
    return JSON.parse(trimmed)
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start === -1 || end <= start) return null
    try {
      return JSON.parse(trimmed.slice(start, end + 1))
    } catch {
      return null
    }
  }
}

/**
 * Validate model output against the intent schema.
 * - unknown / disallowed actionIds are dropped
 * - params are validated (and stripped of unknown keys) by each action's paramsSchema
 * - at most 4 intents are kept
 * Returns { intents, dropped } where intents are [{ actionId, confidence, params, title, subtitle? }].
 */
export function validateIntents(raw, { allowedIds } = {}) {
  const data = typeof raw === 'string' ? extractJson(raw) : raw
  const list = data && Array.isArray(data.intents) ? data.intents : null
  if (!list) return { intents: [], dropped: 0, malformed: true }
  const intents = []
  let dropped = 0
  for (const item of list) {
    if (intents.length >= AI_MAX_INTENTS) break
    try {
      if (!item || typeof item !== 'object') throw new Error('not an object')
      const action = getAction(item.actionId)
      if (!action || (allowedIds && !allowedIds.includes(action.id)))
        throw new Error('unknown action')
      const params = action.paramsSchema(item.params ?? {}, 'params')
      const confidence = Number(item.confidence)
      intents.push({
        actionId: action.id,
        confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.5,
        params,
        title: typeof item.title === 'string' ? item.title.slice(0, 120) : undefined,
        subtitle: typeof item.subtitle === 'string' ? item.subtitle.slice(0, 160) : undefined
      })
    } catch {
      dropped++
    }
  }
  return { intents, dropped, malformed: false }
}
