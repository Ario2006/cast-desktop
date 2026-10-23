const DAY = 86_400_000

const rowToTask = (r) =>
  r && {
    id: r.id,
    text: r.text,
    due: r.due_at,
    done: r.done_at != null,
    doneAt: r.done_at,
    reminderId: r.reminder_id,
    createdAt: r.created_at
  }

export const tasksRepo = (db) => ({
  create({ text, due = null, reminderId = null, now = Date.now() }) {
    const info = db
      .prepare('INSERT INTO tasks(text, due_at, reminder_id, created_at) VALUES(?, ?, ?, ?)')
      .run(text, due, reminderId, now)
    return this.get(Number(info.lastInsertRowid))
  },
  get: (id) => rowToTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)),
  update(id, fields) {
    const cols = { text: 'text', due: 'due_at', doneAt: 'done_at', reminderId: 'reminder_id' }
    const sets = []
    const vals = []
    for (const [k, c] of Object.entries(cols))
      if (k in fields) (sets.push(`${c} = ?`), vals.push(fields[k]))
    if (sets.length) db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id)
    return this.get(id)
  },
  /** Open tasks first (overdue / soonest due first, undated after), then recently completed. */
  list({ includeDone = true, limit = 100 } = {}) {
    const open = db
      .prepare(
        'SELECT * FROM tasks WHERE done_at IS NULL ORDER BY due_at IS NULL, due_at, created_at DESC LIMIT ?'
      )
      .all(limit)
      .map(rowToTask)
    if (!includeDone) return open
    const done = db
      .prepare('SELECT * FROM tasks WHERE done_at IS NOT NULL ORDER BY done_at DESC LIMIT 20')
      .all()
      .map(rowToTask)
    return [...open, ...done]
  },
  /** Open tasks due before `until` (includes overdue). */
  due(until) {
    return db
      .prepare(
        'SELECT * FROM tasks WHERE done_at IS NULL AND due_at IS NOT NULL AND due_at < ? ORDER BY due_at'
      )
      .all(until)
      .map(rowToTask)
  },
  completedSince: (since) =>
    db.prepare('SELECT COUNT(*) c FROM tasks WHERE done_at >= ?').get(since).c,
  delete: (id) => db.prepare('DELETE FROM tasks WHERE id = ?').run(id).changes > 0,
  clearDone: () => db.prepare('DELETE FROM tasks WHERE done_at IS NOT NULL').run().changes,
  all: () => db.prepare('SELECT * FROM tasks').all().map(rowToTask)
})

const rowToEntry = (r) =>
  r ? { id: r.id, project: r.project, startedAt: r.started_at, endedAt: r.ended_at } : null

export const timeRepo = (db) => ({
  running: () =>
    rowToEntry(
      db
        .prepare(
          'SELECT * FROM time_entries WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1'
        )
        .get()
    ),
  /** Starts tracking `project`, stopping whatever was running. */
  start(project, now = Date.now()) {
    db.prepare('UPDATE time_entries SET ended_at = ? WHERE ended_at IS NULL').run(now)
    const info = db
      .prepare('INSERT INTO time_entries(project, started_at) VALUES(?, ?)')
      .run(project, now)
    return rowToEntry(
      db.prepare('SELECT * FROM time_entries WHERE id = ?').get(Number(info.lastInsertRowid))
    )
  },
  stop(now = Date.now()) {
    const cur = this.running()
    if (!cur) return null
    db.prepare('UPDATE time_entries SET ended_at = ? WHERE id = ?').run(now, cur.id)
    return { ...cur, endedAt: now }
  },
  /** Totals per project for [from, to), counting the running entry up to `now`. */
  totals(from, to, now = Date.now()) {
    const rows = db
      .prepare(
        'SELECT * FROM time_entries WHERE started_at < ? AND (ended_at IS NULL OR ended_at > ?)'
      )
      .all(to, from)
    const out = {}
    for (const r of rows) {
      const ms = Math.max(0, Math.min(r.ended_at ?? now, to, now) - Math.max(r.started_at, from))
      out[r.project] = (out[r.project] ?? 0) + ms
    }
    return Object.entries(out)
      .map(([project, ms]) => ({ project, ms }))
      .filter((x) => x.ms > 0)
      .sort((a, b) => b.ms - a.ms)
  },
  recentProjects: (limit = 8) =>
    db
      .prepare(
        'SELECT project, MAX(started_at) last FROM time_entries GROUP BY project ORDER BY last DESC LIMIT ?'
      )
      .all(limit)
      .map((r) => r.project),
  deleteEntry: (id) => db.prepare('DELETE FROM time_entries WHERE id = ?').run(id).changes > 0,
  entries: (from, limit = 50) =>
    db
      .prepare('SELECT * FROM time_entries WHERE started_at >= ? ORDER BY started_at DESC LIMIT ?')
      .all(from, limit)
      .map(rowToEntry),
  DAY
})

const rowToLink = (r) => r && { id: r.id, keyword: r.keyword, name: r.name, url: r.url }

export const quicklinksRepo = (db) => ({
  list: () => db.prepare('SELECT * FROM quicklinks ORDER BY keyword').all().map(rowToLink),
  get: (id) => rowToLink(db.prepare('SELECT * FROM quicklinks WHERE id = ?').get(id)),
  create({ keyword, name, url, now = Date.now() }) {
    const info = db
      .prepare('INSERT INTO quicklinks(keyword, name, url, created_at) VALUES(?, ?, ?, ?)')
      .run(keyword, name, url, now)
    return this.get(Number(info.lastInsertRowid))
  },
  update(id, { keyword, name, url }) {
    const cur = this.get(id)
    if (!cur) return null
    db.prepare('UPDATE quicklinks SET keyword = ?, name = ?, url = ? WHERE id = ?').run(
      keyword ?? cur.keyword,
      name ?? cur.name,
      url ?? cur.url,
      id
    )
    return this.get(id)
  },
  delete: (id) => db.prepare('DELETE FROM quicklinks WHERE id = ?').run(id).changes > 0
})
