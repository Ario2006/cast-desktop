import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDb } from '../src/main/db/index.js'
import { remindersRepo } from '../src/main/db/reminders.js'
import { timersRepo } from '../src/main/db/timers.js'
import { createScheduler, MISSED_GRACE_MS, timerView } from '../src/main/scheduler.js'

const T0 = new Date('2026-10-22T10:00:00Z').getTime()
const SEC = 1000
const MIN = 60 * SEC

let db, notes, changes, sched
const make = (database = db) =>
  createScheduler({ db: database, notify: (n) => notes.push(n), onChange: (s) => changes.push(s) })

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
  db = openDb()
  notes = []
  changes = []
  sched = make()
  sched.init()
})
afterEach(() => {
  sched.dispose()
  vi.useRealTimers()
})

describe('timers', () => {
  it('fires a notification at zero (acceptance #2) and marks the timer done', () => {
    const t = sched.startTimer({ durationSeconds: 25 * 60, label: 'Focus' })
    expect(t.remainingMs).toBe(25 * MIN)
    vi.advanceTimersByTime(25 * MIN - 1000)
    expect(notes).toEqual([])
    vi.advanceTimersByTime(1100)
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatchObject({ kind: 'timer', timerId: t.id })
    expect(notes[0].title).toContain('Focus')
    expect(sched.getTimer(t.id).state).toBe('done')
    expect(sched.listTimers()).toEqual([])
    expect(changes.at(-1).finished.id).toBe(t.id)
  })

  it('pause freezes remaining time; resume continues it', () => {
    const t = sched.startTimer({ durationSeconds: 60 })
    vi.advanceTimersByTime(20 * SEC)
    const p = sched.control(t.id, 'pause')
    expect(p).toMatchObject({ state: 'paused', remainingMs: 40 * SEC })
    vi.advanceTimersByTime(10 * MIN)
    expect(notes).toEqual([]) // paused timers never fire
    expect(sched.getTimer(t.id).remainingMs).toBe(40 * SEC)
    sched.control(t.id, 'resume')
    vi.advanceTimersByTime(39 * SEC)
    expect(notes).toEqual([])
    vi.advanceTimersByTime(2 * SEC)
    expect(notes).toHaveLength(1)
  })

  it('+1 min extends a running timer; reset returns to full duration', () => {
    const t = sched.startTimer({ durationSeconds: 60 })
    vi.advanceTimersByTime(30 * SEC)
    sched.control(t.id, 'add', 60_000)
    expect(sched.getTimer(t.id).remainingMs).toBe(90 * SEC)
    vi.advanceTimersByTime(60 * SEC)
    expect(notes).toEqual([])
    vi.advanceTimersByTime(31 * SEC)
    expect(notes).toHaveLength(1)
    const t2 = sched.startTimer({ durationSeconds: 60 })
    vi.advanceTimersByTime(30 * SEC)
    expect(sched.control(t2.id, 'reset')).toMatchObject({ state: 'paused', remainingMs: 60 * SEC })
  })

  it('cancelled timers never fire; multiple timers run independently', () => {
    const a = sched.startTimer({ durationSeconds: 10 })
    sched.startTimer({ durationSeconds: 20, label: 'b' })
    sched.control(a.id, 'cancel')
    vi.advanceTimersByTime(30 * SEC)
    expect(notes).toHaveLength(1)
    expect(notes[0].title).toContain('b')
  })

  it('stopwatch: elapsed, laps with splits, reset', () => {
    const s = sched.startStopwatch()
    vi.advanceTimersByTime(5 * SEC)
    sched.control(s.id, 'lap')
    vi.advanceTimersByTime(7 * SEC)
    const after = sched.control(s.id, 'lap')
    expect(after.laps).toEqual([
      { n: 1, totalMs: 5000, splitMs: 5000 },
      { n: 2, totalMs: 12_000, splitMs: 7000 }
    ])
    sched.control(s.id, 'pause')
    vi.advanceTimersByTime(MIN)
    expect(sched.getTimer(s.id).elapsedMs).toBe(12_000)
    expect(sched.control(s.id, 'reset')).toMatchObject({ elapsedMs: 0, laps: [] })
  })

  it('survives a restart: absolute end time is recomputed, not an elapsed counter', () => {
    const t = sched.startTimer({ durationSeconds: 100 })
    sched.dispose()
    vi.setSystemTime(T0 + 60 * SEC) // app was closed for a minute
    notes = []
    sched = make()
    sched.init()
    expect(sched.getTimer(t.id).remainingMs).toBe(40 * SEC)
    vi.advanceTimersByTime(41 * SEC)
    expect(notes).toHaveLength(1)
  })

  it('a timer that expired while the app was closed fires on next launch', () => {
    const t = sched.startTimer({ durationSeconds: 30 })
    sched.dispose()
    vi.setSystemTime(T0 + 10 * MIN)
    notes = []
    sched = make()
    sched.init()
    expect(notes).toHaveLength(1)
    expect(sched.getTimer(t.id).state).toBe('done')
  })

  it('sleep/wake: onResume fires anything that came due while asleep', () => {
    sched.startTimer({ durationSeconds: 60 })
    // simulate sleep: the wall clock jumps without any timers firing
    vi.setSystemTime(T0 + 5 * MIN)
    expect(notes).toEqual([])
    sched.onResume()
    expect(notes).toHaveLength(1)
  })

  it('rejects unknown ops and ids', () => {
    expect(() => sched.control(999, 'pause')).toThrow(/not found/i)
    const t = sched.startTimer({ durationSeconds: 5 })
    expect(() => sched.control(t.id, 'explode')).toThrow(/Unknown/)
  })
})

describe('reminders', () => {
  it('fires at the due time (acceptance #3)', () => {
    sched.createReminder({ text: 'Call mom', remindAt: T0 + 30 * MIN })
    vi.advanceTimersByTime(29 * MIN)
    expect(notes).toEqual([])
    vi.advanceTimersByTime(2 * MIN)
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatchObject({
      kind: 'reminder',
      title: 'Reminder',
      body: 'Call mom',
      missed: false
    })
  })

  it('fires after an app restart', () => {
    sched.createReminder({ text: 'Pay rent', remindAt: T0 + 2 * MIN })
    sched.dispose()
    sched = make() // new process, same database
    sched.init()
    vi.advanceTimersByTime(3 * MIN)
    expect(notes.map((n) => n.body)).toEqual(['Pay rent'])
  })

  it('missed reminders fire on next launch with a "missed" label', () => {
    sched.createReminder({ text: 'Stretch', remindAt: T0 + 5 * MIN })
    sched.dispose()
    vi.setSystemTime(T0 + 2 * 3600 * SEC)
    notes = []
    sched = make()
    sched.init()
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatchObject({ title: 'Missed reminder', missed: true })
  })

  it('a reminder that is only slightly late is not "missed"', () => {
    sched.createReminder({ text: 'x', remindAt: T0 + 1000 })
    vi.setSystemTime(T0 + 1000 + MISSED_GRACE_MS - 1000)
    sched.tick()
    expect(notes[0].missed).toBe(false)
  })

  it('does not fire twice', () => {
    sched.createReminder({ text: 'once', remindAt: T0 + SEC })
    vi.advanceTimersByTime(10 * MIN)
    expect(notes).toHaveLength(1)
  })

  it('daily repeat re-arms for the next day', () => {
    sched.createReminder({ text: 'vitamins', remindAt: T0 + 10 * SEC, repeat: 'daily' })
    vi.advanceTimersByTime(11 * SEC)
    expect(notes).toHaveLength(1)
    vi.advanceTimersByTime(24 * 3600 * SEC)
    expect(notes).toHaveLength(2)
  })

  it('snooze re-fires 10 minutes later; done stops it', () => {
    const r = sched.createReminder({ text: 'call', remindAt: T0 + SEC })
    vi.advanceTimersByTime(2 * SEC)
    expect(notes).toHaveLength(1)
    sched.snoozeReminder(r.id, 10)
    vi.advanceTimersByTime(9 * MIN)
    expect(notes).toHaveLength(1)
    vi.advanceTimersByTime(2 * MIN)
    expect(notes).toHaveLength(2)
    sched.doneReminder(r.id)
    expect(remindersRepo(db).get(r.id).state).toBe('done')
  })

  it('snoozing a repeating reminder creates a one-off instead of moving the series', () => {
    const r = sched.createReminder({ text: 'gym', remindAt: T0 + SEC, repeat: 'weekly' })
    vi.advanceTimersByTime(2 * SEC)
    const before = remindersRepo(db).get(r.id).remindAt
    sched.snoozeReminder(r.id, 10)
    expect(remindersRepo(db).get(r.id).remindAt).toBe(before)
    expect(remindersRepo(db).listScheduled()).toHaveLength(2)
  })

  it('editing a reminder reschedules it', () => {
    const r = sched.createReminder({ text: 'a', remindAt: T0 + 5 * MIN })
    sched.updateReminder(r.id, { remindAt: T0 + MIN })
    vi.advanceTimersByTime(2 * MIN)
    expect(notes).toHaveLength(1)
  })

  it('handles far-future reminders without overflowing setTimeout', () => {
    sched.createReminder({ text: 'later', remindAt: T0 + 90 * 86_400_000 })
    vi.advanceTimersByTime(30 * 86_400_000)
    expect(notes).toEqual([])
    expect(vi.getTimerCount()).toBe(1)
  })
})

describe('timerView', () => {
  it('computes elapsed / remaining from absolute timestamps', () => {
    const raw = timersRepo(db).insert({ kind: 'timer', durationMs: 10_000, now: T0 })
    expect(timerView(raw, T0 + 4000)).toMatchObject({
      elapsedMs: 4000,
      remainingMs: 6000,
      endsAt: T0 + 10_000
    })
    expect(
      timerView({ ...raw, state: 'paused', startedAt: null, accumulatedMs: 7000 }, T0 + 99_999)
        .remainingMs
    ).toBe(3000)
  })
})
