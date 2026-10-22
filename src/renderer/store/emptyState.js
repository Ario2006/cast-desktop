import { getAction, isEnabled, makeSuggestion } from '@shared/actionRegistry'
import { formatClock } from '@shared/durations'
import { safe } from '@shared/validate'

const MAX_EMPTY = 5

/**
 * Rows for an empty input: running timers/stopwatches first, then pinned favorites, then
 * recently used actions (max 5 of the latter two).
 */
export function emptyStateRows(state) {
  const ctx = { now: new Date(), settings: state.settings, recording: state.status.recording }
  const rows = []

  for (const t of state.timers) {
    const actionId = t.kind === 'timer' ? 'timer.start' : 'stopwatch.start'
    const action = getAction(actionId)
    rows.push(
      makeSuggestion(action, { timerId: t.id, label: t.label ?? undefined }, ctx, {
        section: 'Running',
        liveTimerId: t.id,
        title: t.label || (t.kind === 'timer' ? 'Timer' : 'Stopwatch'),
        subtitle: t.kind === 'timer' ? formatClock(t.remainingMs) : formatClock(t.elapsedMs),
        matchScore: 1
      })
    )
  }

  if (state.status.recording) {
    rows.push(
      makeSuggestion(getAction('record.stop'), {}, ctx, { section: 'Running', matchScore: 1 })
    )
  }

  const seen = new Set()
  const extra = []
  const add = (actionId, section, subtitle) => {
    const action = getAction(actionId)
    // only actions that can run with no parameters make sense as a recent/favorite shortcut
    if (
      !action ||
      seen.has(actionId) ||
      !isEnabled(action, state.settings, ctx) ||
      !safe(action.paramsSchema, {}).ok
    )
      return
    seen.add(actionId)
    extra.push(
      makeSuggestion(action, {}, ctx, {
        section,
        subtitle: subtitle ?? action.describe({}, ctx).subtitle,
        matchScore: 1
      })
    )
  }
  for (const id of state.settings.favorites) add(id, 'Favorites')
  for (const r of state.recents) add(r.actionId, 'Recent', r.summary)
  return [...rows, ...extra.slice(0, MAX_EMPTY)]
}
