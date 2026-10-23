import { getAction } from '../../shared/actionRegistry.js'

const DAY = 86_400_000

/** A local, private weekly summary built from action history, tasks and time tracking. */
export function buildInsights({ db, tasks, time, now = Date.now() }) {
  const since = now - 7 * DAY
  const rows = db
    .prepare('SELECT action_id, used_at FROM action_history WHERE used_at >= ?')
    .all(since)
  const byAction = {}
  const byDay = Array(7).fill(0)
  for (const r of rows) {
    byAction[r.action_id] = (byAction[r.action_id] ?? 0) + 1
    const idx = 6 - Math.floor((now - r.used_at) / DAY)
    if (idx >= 0 && idx < 7) byDay[idx]++
  }
  const top = Object.entries(byAction)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({ id, title: getAction(id)?.title ?? id, count }))
  const timers = db
    .prepare(
      "SELECT COUNT(*) c FROM timers WHERE kind = 'timer' AND state = 'done' AND created_at >= ?"
    )
    .get(since).c
  const notes = db.prepare('SELECT COUNT(*) c FROM notes WHERE created_at >= ?').get(since).c
  const tracked = time.totals(since, now + 1, now)
  return {
    total: rows.length,
    byDay,
    top,
    timersFinished: timers,
    notesWritten: notes,
    tasksDone: tasks.completedSince(since),
    tracked: tracked.slice(0, 5),
    trackedTotal: tracked.reduce((a, b) => a + b.ms, 0)
  }
}
