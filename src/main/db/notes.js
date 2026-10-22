const rowToNote = (r) =>
  r && {
    id: r.id,
    title: r.title ?? null,
    body: r.body,
    pinned: Boolean(r.pinned),
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }

/** Turn user text into a safe FTS5 prefix query: every token quoted, last one prefix-matched. */
export function ftsQuery(text) {
  const tokens = String(text)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 8)
  return tokens.map((t) => `"${t}"*`).join(' ')
}

export const notesRepo = (db) => ({
  create({ title = null, body, now = Date.now() }) {
    const info = db
      .prepare(
        'INSERT INTO notes(title, body, pinned, created_at, updated_at) VALUES(?, ?, 0, ?, ?)'
      )
      .run(title, body, now, now)
    return this.get(Number(info.lastInsertRowid))
  },
  get: (id) => rowToNote(db.prepare('SELECT * FROM notes WHERE id = ?').get(id)),
  update(id, { title, body, pinned, now = Date.now() }) {
    const cur = this.get(id)
    if (!cur) return null
    db.prepare('UPDATE notes SET title = ?, body = ?, pinned = ?, updated_at = ? WHERE id = ?').run(
      title === undefined ? cur.title : title,
      body === undefined ? cur.body : body,
      (pinned === undefined ? cur.pinned : pinned) ? 1 : 0,
      now,
      id
    )
    return this.get(id)
  },
  delete: (id) => db.prepare('DELETE FROM notes WHERE id = ?').run(id).changes > 0,
  recent: (limit = 20) =>
    db
      .prepare('SELECT * FROM notes ORDER BY pinned DESC, updated_at DESC LIMIT ?')
      .all(limit)
      .map(rowToNote),
  search(query, limit = 20) {
    const q = ftsQuery(query)
    if (!q) return this.recent(limit)
    return db
      .prepare(
        `SELECT n.* FROM notes_fts f JOIN notes n ON n.id = f.rowid
         WHERE notes_fts MATCH ? ORDER BY bm25(notes_fts), n.updated_at DESC LIMIT ?`
      )
      .all(q, limit)
      .map(rowToNote)
  },
  clear: () => db.prepare('DELETE FROM notes').run().changes
})
