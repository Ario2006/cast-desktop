export const historyRepo = (db) => ({
  record(actionId, summary, now = Date.now()) {
    db.prepare('INSERT INTO action_history(action_id, summary, used_at) VALUES(?, ?, ?)').run(
      actionId,
      summary ?? null,
      now
    )
    // keep the table small: only the last ~500 entries matter for recency/frequency
    db.prepare(
      'DELETE FROM action_history WHERE id <= (SELECT id FROM action_history ORDER BY id DESC LIMIT 1 OFFSET 500)'
    ).run()
  },
  /** { [actionId]: { count, lastUsed } } */
  stats() {
    const out = {}
    for (const r of db
      .prepare(
        'SELECT action_id, COUNT(*) AS c, MAX(used_at) AS last FROM action_history GROUP BY action_id'
      )
      .all()) {
      out[r.action_id] = { count: r.c, lastUsed: r.last }
    }
    return out
  },
  /** Most recent distinct (action, summary) pairs. */
  recent(limit = 5) {
    return db
      .prepare(
        `SELECT action_id AS actionId, summary, MAX(used_at) AS usedAt FROM action_history
         GROUP BY action_id, summary ORDER BY usedAt DESC LIMIT ?`
      )
      .all(limit)
  },
  clear: () => db.prepare('DELETE FROM action_history').run().changes
})

export const capturesRepo = (db) => ({
  insert({ kind, path, durationMs = null, now = Date.now() }) {
    db.prepare('INSERT INTO captures(kind, path, duration_ms, created_at) VALUES(?, ?, ?, ?)').run(
      kind,
      path,
      durationMs,
      now
    )
  }
})
