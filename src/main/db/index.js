import Database from 'better-sqlite3'

// Migrations are plain SQL files named NNN_name.sql, applied in order and tracked with
// PRAGMA user_version. Vite inlines them at build time.
const files = import.meta.glob('./migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true
})

export const MIGRATIONS = Object.entries(files)
  .map(([path, sql]) => {
    const name = path.split('/').pop()
    return { version: Number.parseInt(name, 10), name, sql }
  })
  .sort((a, b) => a.version - b.version)

export function runMigrations(db, migrations = MIGRATIONS) {
  const current = db.pragma('user_version', { simple: true })
  for (const m of migrations) {
    if (m.version <= current) continue
    db.transaction(() => {
      db.exec(m.sql)
      db.pragma(`user_version = ${m.version}`)
    })()
  }
  return db.pragma('user_version', { simple: true })
}

export function openDb(file = ':memory:') {
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return db
}
