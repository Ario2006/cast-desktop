import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDb } from '../src/main/db/index.js'
import { choicesRepo, snippetsRepo } from '../src/main/db/features.js'
import { createScheduler } from '../src/main/scheduler.js'

const T0 = new Date('2026-10-22T10:00:00Z').getTime()
const MIN = 60_000
const CFG = { focus: 2, short: 1, long: 3, cycles: 2 }

let db, notes, sched
const make = () =>
  createScheduler({ db, notify: (n) => notes.push(n), getPomodoroConfig: () => CFG })

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
  db = openDb()
  notes = []
  sched = make()
  sched.init()
})
afterEach(() => {
  sched.dispose()
  vi.useRealTimers()
})

describe('pomodoro', () => {
  it('runs focus → short → focus → long and then completes', () => {
    sched.startPomodoro()
    expect(sched.getPomodoro()).toMatchObject({
      phase: 'focus',
      cycle: 1,
      cycles: 2,
      label: 'Focus 1/2'
    })

    vi.advanceTimersByTime(2 * MIN + 100)
    expect(sched.getPomodoro()).toMatchObject({ phase: 'short', cycle: 1, label: 'Short break' })
    expect(notes.at(-1)).toMatchObject({ kind: 'pomodoro', title: 'Time for a break' })

    vi.advanceTimersByTime(1 * MIN + 100)
    expect(sched.getPomodoro()).toMatchObject({ phase: 'focus', cycle: 2, label: 'Focus 2/2' })
    expect(notes.at(-1).title).toBe('Back to focus')

    vi.advanceTimersByTime(2 * MIN + 100) // last focus → long break
    expect(sched.getPomodoro()).toMatchObject({ phase: 'long', label: 'Long break' })

    vi.advanceTimersByTime(3 * MIN + 100)
    expect(sched.getPomodoro()).toBeNull()
    expect(notes.at(-1).title).toBe('Pomodoro complete')
    expect(notes.every((n) => n.kind === 'pomodoro')).toBe(true) // no stray generic timer notifications
  })

  it('skip jumps to the next phase; stop ends the session and its timer', () => {
    sched.startPomodoro()
    expect(sched.skipPomodoro()).toMatchObject({ phase: 'short' })
    sched.stopPomodoro()
    expect(sched.getPomodoro()).toBeNull()
    expect(sched.listTimers()).toEqual([])
    vi.advanceTimersByTime(10 * MIN)
    expect(notes).toEqual([])
  })

  it('restarting replaces the previous session', () => {
    sched.startPomodoro()
    vi.advanceTimersByTime(MIN)
    sched.startPomodoro()
    expect(sched.listTimers()).toHaveLength(1)
    expect(sched.getPomodoro().timer.remainingMs).toBe(2 * MIN)
  })

  it('survives a restart of the app mid-session', () => {
    sched.startPomodoro()
    sched.dispose()
    vi.setSystemTime(T0 + 30_000)
    sched = make()
    sched.init()
    expect(sched.getPomodoro().timer.remainingMs).toBe(90_000)
    vi.advanceTimersByTime(91_000)
    expect(sched.getPomodoro().phase).toBe('short')
  })

  it('is included in change snapshots', () => {
    const seen = []
    sched.dispose()
    sched = createScheduler({ db, onChange: (s) => seen.push(s), getPomodoroConfig: () => CFG })
    sched.init()
    sched.startPomodoro()
    expect(seen.at(-1).pomodoro).toMatchObject({ phase: 'focus' })
  })
})

describe('timer setDuration ("make it 30 minutes")', () => {
  it('restarts the timer with a new total length', () => {
    const t = sched.startTimer({ durationSeconds: 60 })
    vi.advanceTimersByTime(30_000)
    expect(sched.control(t.id, 'setDuration', 30 * MIN).remainingMs).toBe(30 * MIN)
    vi.advanceTimersByTime(29 * MIN)
    expect(notes).toEqual([])
    vi.advanceTimersByTime(2 * MIN)
    expect(notes).toHaveLength(1)
  })
  it('revives a finished timer and ignores nonsense values', () => {
    const t = sched.startTimer({ durationSeconds: 5 })
    vi.advanceTimersByTime(6000)
    expect(sched.getTimer(t.id).state).toBe('done')
    expect(sched.control(t.id, 'setDuration', 2 * MIN)).toMatchObject({
      state: 'running',
      remainingMs: 2 * MIN
    })
    const before = sched.getTimer(t.id).durationMs
    sched.control(t.id, 'setDuration', -5)
    sched.control(t.id, 'setDuration', 'x')
    expect(sched.getTimer(t.id).durationMs).toBe(before)
  })
})

describe('choices + snippets repos', () => {
  it('counts choices per shape and keeps the table bounded', () => {
    const c = choicesRepo(db)
    c.record('remind me', 'reminder.create', 1)
    c.record('remind me', 'reminder.create', 2)
    c.record('remind me', 'note.create', 3)
    c.record('', 'x', 4) // empty shape ignored
    expect(c.all()).toEqual({ 'remind me': { 'reminder.create': 2, 'note.create': 1 } })
    for (let i = 0; i < 2100; i++) c.record(`s${i}`, 'a', i)
    expect(db.prepare('SELECT COUNT(*) c FROM choice_stats').get().c).toBeLessThanOrEqual(2000)
    expect(c.clear()).toBeGreaterThan(0)
    expect(c.all()).toEqual({})
  })

  it('snippets: CRUD, unique names (case-insensitive), ranked search', () => {
    const s = snippetsRepo(db)
    const a = s.create({ name: 'Sig', body: 'Best,\nAryan' })
    s.create({ name: 'address', body: '1 Main St' })
    expect(() => s.create({ name: 'sig', body: 'dup' })).toThrow()
    expect(s.search('si').map((x) => x.name)).toEqual(['Sig'])
    expect(s.search('main').map((x) => x.name)).toEqual(['address']) // body match
    expect(s.search('').length).toBe(2)
    expect(s.search("100%_'; DROP TABLE snippets;--")).toEqual([])
    expect(s.update(a.id, { body: 'Cheers' }).body).toBe('Cheers')
    expect(s.delete(a.id)).toBe(true)
    expect(s.get(a.id)).toBeUndefined()
  })
})
