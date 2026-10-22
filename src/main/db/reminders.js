const rowToReminder = (r) =>
  r && {
    id: r.id,
    text: r.text,
    remindAt: r.remind_at,
    repeat: r.repeat ?? null,
    state: r.state,
    createdAt: r.created_at
  }

export const remindersRepo = (db) => ({
  create({ text, remindAt, repeat = null, now = Date.now() }) {
    const info = db
      .prepare(
        "INSERT INTO reminders(text, remind_at, repeat, state, created_at) VALUES(?, ?, ?, 'pending', ?)"
      )
      .run(text, remindAt, repeat === 'none' ? null : repeat, now)
    return this.get(Number(info.lastInsertRowid))
  },
  get: (id) => rowToReminder(db.prepare('SELECT * FROM reminders WHERE id = ?').get(id)),
  update(id, fields) {
    const cols = { text: 'text', remindAt: 'remind_at', repeat: 'repeat', state: 'state' }
    const sets = []
    const values = []
    for (const [k, col] of Object.entries(cols)) {
      if (k in fields) {
        sets.push(`${col} = ?`)
        values.push(k === 'repeat' && fields[k] === 'none' ? null : fields[k])
      }
    }
    if (sets.length)
      db.prepare(`UPDATE reminders SET ${sets.join(', ')} WHERE id = ?`).run(...values, id)
    return this.get(id)
  },
  /** Reminders that still need to fire. */
  listScheduled: () =>
    db
      .prepare("SELECT * FROM reminders WHERE state IN ('pending','snoozed') ORDER BY remind_at")
      .all()
      .map(rowToReminder),
  list: (limit = 50) =>
    db
      .prepare("SELECT * FROM reminders WHERE state != 'done' ORDER BY remind_at LIMIT ?")
      .all(limit)
      .map(rowToReminder),
  delete: (id) => db.prepare('DELETE FROM reminders WHERE id = ?').run(id).changes > 0,
  clear: () => db.prepare('DELETE FROM reminders').run().changes
})
