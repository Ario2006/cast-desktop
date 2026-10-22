import { describe, expect, it } from 'vitest'
import { MIGRATIONS, openDb, runMigrations } from '../src/main/db/index.js'
import { capturesRepo, historyRepo } from '../src/main/db/history.js'
import { ftsQuery, notesRepo } from '../src/main/db/notes.js'
import { remindersRepo } from '../src/main/db/reminders.js'
import { getAllSettings, setSetting } from '../src/main/db/settings.js'
import { timersRepo } from '../src/main/db/timers.js'
import { DEFAULT_SETTINGS } from '../src/shared/settings.js'

describe('migrations', () => {
  it('creates the spec schema and tracks the version in PRAGMA user_version', () => {
    const db = openDb()
    expect(db.pragma('user_version', { simple: true })).toBe(MIGRATIONS.at(-1).version)
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table')")
      .all()
      .map((r) => r.name)
    for (const t of [
      'settings',
      'timers',
      'notes',
      'notes_fts',
      'reminders',
      'action_history',
      'captures'
    ])
      expect(tables).toContain(t)
  })

  it('is idempotent and applies only pending migrations', () => {
    const db = openDb()
    const before = db.pragma('user_version', { simple: true })
    expect(runMigrations(db)).toBe(before)
    const extra = [
      ...MIGRATIONS,
      { version: before + 1, name: 'x', sql: 'CREATE TABLE extra(id INTEGER);' }
    ]
    expect(runMigrations(db, extra)).toBe(before + 1)
    expect(db.prepare("SELECT 1 FROM sqlite_master WHERE name='extra'").get()).toBeTruthy()
  })

  it('rolls back a failing migration atomically', () => {
    const db = openDb()
    const v = db.pragma('user_version', { simple: true })
    const bad = [
      ...MIGRATIONS,
      {
        version: v + 1,
        name: 'bad',
        sql: 'CREATE TABLE ok(id INTEGER); SELECT * FROM missing_table;'
      }
    ]
    expect(() => runMigrations(db, bad)).toThrow()
    expect(db.pragma('user_version', { simple: true })).toBe(v)
    expect(db.prepare("SELECT 1 FROM sqlite_master WHERE name='ok'").get()).toBeUndefined()
  })

  it('enforces CHECK constraints', () => {
    const db = openDb()
    expect(() =>
      db.prepare("INSERT INTO timers(kind, state, created_at) VALUES('bogus','running',1)").run()
    ).toThrow()
    expect(() =>
      db
        .prepare(
          "INSERT INTO reminders(text, remind_at, state, created_at) VALUES('x',1,'weird',1)"
        )
        .run()
    ).toThrow()
  })
})

describe('settings repo', () => {
  it('returns defaults, persists validated values, and ignores corrupt rows', () => {
    const db = openDb()
    expect(getAllSettings(db)).toEqual(DEFAULT_SETTINGS)
    expect(setSetting(db, 'searchEngine', 'brave')).toBe('brave')
    expect(getAllSettings(db).searchEngine).toBe('brave')
    expect(() => setSetting(db, 'searchEngine', 'bing')).toThrow()
    db.prepare("INSERT INTO settings(key, value) VALUES('maxResults', '\"oops\"')").run()
    db.prepare("INSERT INTO settings(key, value) VALUES('notASetting', '1')").run()
    const all = getAllSettings(db)
    expect(all.maxResults).toBe(DEFAULT_SETTINGS.maxResults)
    expect(all).not.toHaveProperty('notASetting')
  })
})

describe('notes + FTS5', () => {
  it('searches body and title, prefix-matches, and stays in sync on update/delete', () => {
    const db = openDb()
    const notes = notesRepo(db)
    const a = notes.create({ title: 'Groceries', body: 'buy milk and eggs' })
    const b = notes.create({ body: 'call the dentist about the crown' })
    expect(notes.search('milk').map((n) => n.id)).toEqual([a.id])
    expect(notes.search('gro').map((n) => n.id)).toEqual([a.id]) // title prefix
    expect(notes.search('dent').map((n) => n.id)).toEqual([b.id])
    notes.update(a.id, { body: 'buy bread' })
    expect(notes.search('milk')).toEqual([])
    expect(notes.search('bread')).toHaveLength(1)
    notes.delete(b.id)
    expect(notes.search('dentist')).toEqual([])
  })

  it('empty queries list recent notes; hostile FTS syntax cannot break the query', () => {
    const db = openDb()
    const notes = notesRepo(db)
    notes.create({ body: 'one' })
    expect(notes.search('')).toHaveLength(1)
    for (const q of ['"', 'a OR', '* NEAR(', "'; DROP TABLE notes;--", 'NOT', '(', '":*']) {
      expect(() => notes.search(q), q).not.toThrow()
    }
    expect(db.prepare('SELECT COUNT(*) c FROM notes').get().c).toBe(1)
    expect(ftsQuery('Hello, World!')).toBe('"hello"* "world"*')
  })

  it('pins sort first and clear() removes everything', () => {
    const db = openDb()
    const notes = notesRepo(db)
    const a = notes.create({ body: 'old', now: 1 })
    notes.create({ body: 'new', now: 2 })
    notes.update(a.id, { pinned: true, now: 0 })
    expect(notes.recent()[0].id).toBe(a.id)
    expect(notes.clear()).toBe(2)
    expect(notes.search('old')).toEqual([])
  })
})

describe('timers repo', () => {
  it('round-trips and lists only active timers', () => {
    const db = openDb()
    const t = timersRepo(db)
    const a = t.insert({ kind: 'timer', label: 'tea', durationMs: 60_000, now: 1000 })
    const b = t.insert({ kind: 'stopwatch', now: 2000 })
    expect(a).toMatchObject({
      kind: 'timer',
      label: 'tea',
      durationMs: 60_000,
      startedAt: 1000,
      state: 'running',
      laps: []
    })
    t.update(b.id, { state: 'done' })
    expect(t.listActive().map((x) => x.id)).toEqual([a.id])
    t.update(a.id, { laps: [{ n: 1 }], state: 'paused', startedAt: null, accumulatedMs: 5 })
    expect(t.get(a.id)).toMatchObject({ state: 'paused', accumulatedMs: 5, laps: [{ n: 1 }] })
  })
  it('prunes old finished timers only', () => {
    const db = openDb()
    const t = timersRepo(db)
    const old = t.insert({ kind: 'timer', durationMs: 1, now: 1 })
    t.update(old.id, { state: 'done' })
    const live = t.insert({ kind: 'timer', durationMs: 1, now: 1 })
    t.prune(100)
    expect(t.get(old.id)).toBeUndefined()
    expect(t.get(live.id)).toBeTruthy()
  })
})

describe('reminders + history repos', () => {
  it('reminders: schedule, update, repeat normalisation', () => {
    const db = openDb()
    const r = remindersRepo(db)
    const a = r.create({ text: 'a', remindAt: 5, repeat: 'none' })
    expect(a.repeat).toBeNull()
    r.update(a.id, { state: 'fired' })
    expect(r.listScheduled()).toEqual([])
    r.update(a.id, { state: 'snoozed', remindAt: 9 })
    expect(r.listScheduled()[0]).toMatchObject({ id: a.id, remindAt: 9 })
    expect(r.delete(a.id)).toBe(true)
  })

  it('history: stats, distinct recents, bounded size, clear', () => {
    const db = openDb()
    const h = historyRepo(db)
    h.record('timer.start', 'Timer 25m', 10)
    h.record('timer.start', 'Timer 25m', 20)
    h.record('note.create', 'Note', 30)
    expect(h.stats()['timer.start']).toEqual({ count: 2, lastUsed: 20 })
    expect(h.recent(5).map((r) => r.actionId)).toEqual(['note.create', 'timer.start'])
    for (let i = 0; i < 700; i++) h.record('x', null, i)
    expect(db.prepare('SELECT COUNT(*) c FROM action_history').get().c).toBeLessThanOrEqual(501)
    expect(h.clear()).toBeGreaterThan(0)
    expect(h.stats()).toEqual({})
  })

  it('stores no raw query text anywhere in the schema', () => {
    const db = openDb()
    const cols = db
      .prepare("SELECT name FROM pragma_table_info('action_history')")
      .all()
      .map((c) => c.name)
    expect(cols).toEqual(['id', 'action_id', 'summary', 'used_at'])
    capturesRepo(db).insert({ kind: 'screenshot', path: '/tmp/a.png' })
    expect(db.prepare('SELECT COUNT(*) c FROM captures').get().c).toBe(1)
  })
})
