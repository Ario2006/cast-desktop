const MAX_SHAPES = 2000

/** Which action the user picked for a given input shape; powers the "learned" ranking boost. */
export const choicesRepo = (db) => ({
  record(shape, actionId, now = Date.now()) {
    if (!shape) return
    db.prepare(
      `INSERT INTO choice_stats(shape, action_id, count, last_used) VALUES(?, ?, 1, ?)
       ON CONFLICT(shape, action_id) DO UPDATE SET count = count + 1, last_used = excluded.last_used`
    ).run(shape, actionId, now)
    db.prepare(
      `DELETE FROM choice_stats WHERE rowid IN
       (SELECT rowid FROM choice_stats ORDER BY last_used DESC LIMIT -1 OFFSET ?)`
    ).run(MAX_SHAPES)
  },
  /** { [shape]: { [actionId]: count } } */
  all() {
    const out = {}
    for (const r of db.prepare('SELECT shape, action_id, count FROM choice_stats').all()) {
      ;(out[r.shape] ??= {})[r.action_id] = r.count
    }
    return out
  },
  clear: () => db.prepare('DELETE FROM choice_stats').run().changes
})

const rowToSnippet = (r) => r && { id: r.id, name: r.name, body: r.body, updatedAt: r.updated_at }

export const snippetsRepo = (db) => ({
  create({ name, body, now = Date.now() }) {
    const info = db
      .prepare('INSERT INTO snippets(name, body, created_at, updated_at) VALUES(?, ?, ?, ?)')
      .run(name, body, now, now)
    return this.get(Number(info.lastInsertRowid))
  },
  get: (id) => rowToSnippet(db.prepare('SELECT * FROM snippets WHERE id = ?').get(id)),
  update(id, { name, body, now = Date.now() }) {
    const cur = this.get(id)
    if (!cur) return null
    db.prepare('UPDATE snippets SET name = ?, body = ?, updated_at = ? WHERE id = ?').run(
      name ?? cur.name,
      body ?? cur.body,
      now,
      id
    )
    return this.get(id)
  },
  delete: (id) => db.prepare('DELETE FROM snippets WHERE id = ?').run(id).changes > 0,
  /** Name prefix matches first, then substring matches in name or body. */
  search(query = '', limit = 30) {
    const q = String(query)
      .trim()
      .toLowerCase()
      .replace(/[%_\\]/g, (c) => `\\${c}`)
    if (!q) {
      return db
        .prepare('SELECT * FROM snippets ORDER BY updated_at DESC LIMIT ?')
        .all(limit)
        .map(rowToSnippet)
    }
    return db
      .prepare(
        `SELECT * FROM snippets
         WHERE lower(name) LIKE ? ESCAPE '\\' OR lower(body) LIKE ? ESCAPE '\\'
         ORDER BY (lower(name) LIKE ? ESCAPE '\\') DESC, updated_at DESC LIMIT ?`
      )
      .all(`%${q}%`, `%${q}%`, `${q}%`, limit)
      .map(rowToSnippet)
  }
})

const rowToPomodoro = (r) =>
  r && {
    phase: r.phase,
    cycle: r.cycle,
    timerId: r.timer_id,
    active: Boolean(r.active),
    startedAt: r.started_at
  }

export const pomodoroRepo = (db) => ({
  get: () => rowToPomodoro(db.prepare('SELECT * FROM pomodoro WHERE id = 1').get()),
  save({ phase, cycle, timerId, active = true, startedAt }) {
    db.prepare(
      `INSERT INTO pomodoro(id, phase, cycle, timer_id, active, started_at) VALUES(1, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET phase = excluded.phase, cycle = excluded.cycle,
         timer_id = excluded.timer_id, active = excluded.active, started_at = excluded.started_at`
    ).run(phase, cycle, timerId ?? null, active ? 1 : 0, startedAt)
  },
  stop: () => db.prepare('UPDATE pomodoro SET active = 0 WHERE id = 1').run()
})
