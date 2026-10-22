const rowToTimer = (r) =>
  r && {
    id: r.id,
    kind: r.kind,
    label: r.label ?? null,
    durationMs: r.duration_ms,
    startedAt: r.started_at,
    accumulatedMs: r.accumulated_ms,
    state: r.state,
    laps: r.laps_json ? JSON.parse(r.laps_json) : [],
    createdAt: r.created_at
  }

export const timersRepo = (db) => ({
  insert({ kind, label, durationMs, now }) {
    const info = db
      .prepare(
        `INSERT INTO timers(kind, label, duration_ms, started_at, accumulated_ms, state, laps_json, created_at)
         VALUES(?, ?, ?, ?, 0, 'running', '[]', ?)`
      )
      .run(kind, label ?? null, durationMs ?? null, now, now)
    return this.get(Number(info.lastInsertRowid))
  },
  get: (id) => rowToTimer(db.prepare('SELECT * FROM timers WHERE id = ?').get(id)),
  /** Active = still counting or paused (not done / cancelled). */
  listActive: () =>
    db
      .prepare("SELECT * FROM timers WHERE state IN ('running','paused') ORDER BY created_at")
      .all()
      .map(rowToTimer),
  update(id, fields) {
    const map = {
      label: 'label',
      durationMs: 'duration_ms',
      startedAt: 'started_at',
      accumulatedMs: 'accumulated_ms',
      state: 'state'
    }
    const sets = []
    const values = []
    for (const [k, col] of Object.entries(map)) {
      if (k in fields) {
        sets.push(`${col} = ?`)
        values.push(fields[k])
      }
    }
    if ('laps' in fields) {
      sets.push('laps_json = ?')
      values.push(JSON.stringify(fields.laps))
    }
    if (sets.length)
      db.prepare(`UPDATE timers SET ${sets.join(', ')} WHERE id = ?`).run(...values, id)
    return this.get(id)
  },
  prune(olderThanMs) {
    db.prepare("DELETE FROM timers WHERE state IN ('done','cancelled') AND created_at < ?").run(
      olderThanMs
    )
  }
})
