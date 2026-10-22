import { formatDuration } from '../shared/durations.js'
import { nextRepeat } from '../shared/timeparse.js'
import { remindersRepo } from './db/reminders.js'
import { pomodoroRepo } from './db/features.js'
import { timersRepo } from './db/timers.js'

const MAX_TIMEOUT = 2 ** 31 - 1
/** A reminder fired later than this after its due time is labelled "missed". */
export const MISSED_GRACE_MS = 90_000

/** Decorate a DB timer row with computed fields for a given instant. */
export function timerView(t, now) {
  const running = t.state === 'running' && t.startedAt != null
  const elapsedMs = t.accumulatedMs + (running ? now - t.startedAt : 0)
  const remainingMs = t.kind === 'timer' ? Math.max(0, t.durationMs - elapsedMs) : null
  return {
    ...t,
    elapsedMs,
    remainingMs,
    endsAt: running && remainingMs != null ? now + remainingMs : null
  }
}

/**
 * Owns everything that must outlive the launcher window: timers, stopwatches and reminders.
 * Stores absolute timestamps only (never elapsed counters), so sleep/wake cannot drift.
 *
 * deps:
 *   db        better-sqlite3 database
 *   now       () => epoch ms           (injectable for tests)
 *   notify    (n) => void              n = { kind, title, body, timerId?, reminderId?, missed?, repeat? }
 *   onChange  (snapshot) => void       snapshot = { timers: [...], finished?: view, reminders: [...] }
 */
export const DEFAULT_POMODORO = { focus: 25, short: 5, long: 15, cycles: 4 }

export function createScheduler({
  db,
  now = Date.now,
  notify = () => {},
  onChange = () => {},
  getPomodoroConfig = () => DEFAULT_POMODORO
}) {
  const pomo = pomodoroRepo(db)
  const timers = timersRepo(db)
  const reminders = remindersRepo(db)
  let handle = null

  const activeViews = () => timers.listActive().map((t) => timerView(t, now()))
  const emit = (extra = {}) =>
    onChange({
      timers: activeViews(),
      reminders: reminders.list(20),
      pomodoro: pomodoroView(),
      ...extra
    })

  function nextDueAt() {
    let due = Infinity
    for (const t of timers.listActive()) {
      if (t.kind === 'timer' && t.state === 'running') {
        due = Math.min(due, now() + timerView(t, now()).remainingMs)
      }
    }
    for (const r of reminders.listScheduled()) due = Math.min(due, r.remindAt)
    return due
  }

  function arm() {
    if (handle) clearTimeout(handle)
    handle = null
    const due = nextDueAt()
    if (!Number.isFinite(due)) return
    const delay = Math.min(Math.max(due - now(), 0) + 5, MAX_TIMEOUT)
    handle = setTimeout(tick, delay)
  }

  function finishTimer(t) {
    const done = timers.update(t.id, {
      state: 'done',
      accumulatedMs: t.durationMs,
      startedAt: null
    })
    const view = timerView(done, now())
    if (!advancePomodoro(done.id, true)) {
      notify({
        kind: 'timer',
        timerId: done.id,
        title: done.label ? `${done.label} — time's up` : "Time's up",
        body: `${formatDuration(done.durationMs / 1000)} timer finished`
      })
    }
    return view
  }

  // --- Pomodoro: a chain of ordinary timers (focus → break → … → long break) -------------------
  const pomoMinutes = (phase) => getPomodoroConfig()[phase]
  const pomoLabel = (phase, cycle) =>
    phase === 'focus'
      ? `Focus ${cycle}/${getPomodoroConfig().cycles}`
      : phase === 'short'
        ? 'Short break'
        : 'Long break'

  function startPhase(phase, cycle) {
    const t = timers.insert({
      kind: 'timer',
      label: pomoLabel(phase, cycle),
      durationMs: pomoMinutes(phase) * 60_000,
      now: now()
    })
    pomo.save({ phase, cycle, timerId: t.id, active: true, startedAt: now() })
    return t
  }

  /** Called when the current phase's timer ends (or is skipped). Returns true if it handled the notification. */
  function advancePomodoro(timerId, notifyUser) {
    const p = pomo.get()
    if (!p?.active || p.timerId !== timerId) return false
    const { cycles } = getPomodoroConfig()
    let next = null
    if (p.phase === 'focus') next = { phase: p.cycle >= cycles ? 'long' : 'short', cycle: p.cycle }
    else if (p.phase === 'short') next = { phase: 'focus', cycle: p.cycle + 1 }
    if (!next) {
      pomo.save({ ...p, active: false, startedAt: p.startedAt })
      if (notifyUser)
        notify({
          kind: 'pomodoro',
          timerId,
          title: 'Pomodoro complete',
          body: 'Nice work — session finished.'
        })
      return true
    }
    const t = startPhase(next.phase, next.cycle)
    if (notifyUser) {
      notify({
        kind: 'pomodoro',
        timerId: t.id,
        title: next.phase === 'focus' ? 'Back to focus' : 'Time for a break',
        body: `${pomoLabel(next.phase, next.cycle)} · ${pomoMinutes(next.phase)} min`
      })
    }
    return true
  }

  function pomodoroView() {
    const p = pomo.get()
    if (!p?.active) return null
    const t = p.timerId ? timers.get(p.timerId) : null
    if (!t || !['running', 'paused'].includes(t.state)) return null
    return { ...p, cycles: getPomodoroConfig().cycles, label: t.label, timer: timerView(t, now()) }
  }

  function fireReminder(r, t) {
    const missed = t - r.remindAt > MISSED_GRACE_MS
    notify({
      kind: 'reminder',
      reminderId: r.id,
      title: missed ? 'Missed reminder' : 'Reminder',
      body: r.text,
      missed,
      repeat: r.repeat
    })
    if (r.repeat)
      reminders.update(r.id, { remindAt: nextRepeat(r.remindAt, r.repeat, t), state: 'pending' })
    else reminders.update(r.id, { state: 'fired' })
  }

  /** Fire everything that is due. Also the handler for sleep/wake resume. */
  function tick() {
    const t = now()
    let finished = null
    let changed = false
    for (const row of timers.listActive()) {
      if (row.kind === 'timer' && row.state === 'running' && timerView(row, t).remainingMs <= 0) {
        finished = finishTimer(row)
        changed = true
      }
    }
    for (const r of reminders.listScheduled()) {
      if (r.remindAt <= t) {
        fireReminder(r, t)
        changed = true
      }
    }
    arm()
    if (changed) emit(finished ? { finished } : {})
  }

  const requireTimer = (id) => {
    const t = timers.get(id)
    if (!t) throw Object.assign(new Error('Timer not found'), { code: 'NOT_FOUND' })
    return t
  }

  const api = {
    /** Load persisted state and fire anything that came due while the app was closed. */
    init() {
      timers.prune(now() - 7 * 86_400_000)
      tick()
      emit()
    },
    dispose() {
      if (handle) clearTimeout(handle)
      handle = null
    },
    onResume: tick,
    tick,

    // --- timers & stopwatches ---------------------------------------------------------------
    listTimers: activeViews,
    getTimer: (id) => {
      const t = timers.get(id)
      return t ? timerView(t, now()) : null
    },
    startTimer({ durationSeconds, label }) {
      const t = timers.insert({
        kind: 'timer',
        label,
        durationMs: durationSeconds * 1000,
        now: now()
      })
      arm()
      emit()
      return timerView(t, now())
    },
    startStopwatch({ label } = {}) {
      const t = timers.insert({ kind: 'stopwatch', label, now: now() })
      emit()
      return timerView(t, now())
    },
    control(id, op, value) {
      const t = requireTimer(id)
      const n = now()
      const v = timerView(t, n)
      switch (op) {
        case 'pause':
          if (t.state === 'running')
            timers.update(id, { state: 'paused', accumulatedMs: v.elapsedMs, startedAt: null })
          break
        case 'resume':
          if (t.state === 'paused') timers.update(id, { state: 'running', startedAt: n })
          break
        case 'reset':
          timers.update(id, {
            state: 'paused',
            accumulatedMs: 0,
            startedAt: null,
            ...(t.kind === 'stopwatch' ? { laps: [] } : {})
          })
          break
        case 'restart':
          timers.update(id, { state: 'running', accumulatedMs: 0, startedAt: n })
          break
        case 'setDuration': {
          // "make it 30 minutes": new total length, restarted from now
          const ms = Math.round(Number(value))
          if (t.kind === 'timer' && ms > 0 && ms <= 99 * 3_600_000) {
            timers.update(id, { durationMs: ms, accumulatedMs: 0, startedAt: n, state: 'running' })
          }
          break
        }
        case 'add':
          if (t.kind === 'timer') {
            const added = Math.round(Number(value) || 60_000)
            // extending a finished timer revives it
            if (t.state === 'done') {
              timers.update(id, {
                durationMs: t.durationMs + added,
                state: 'running',
                startedAt: n
              })
            } else {
              timers.update(id, { durationMs: t.durationMs + added })
            }
          }
          break
        case 'lap':
          if (t.kind === 'stopwatch' && t.state === 'running') {
            const prevTotal = t.laps.at(-1)?.totalMs ?? 0
            const laps = [
              ...t.laps,
              { n: t.laps.length + 1, totalMs: v.elapsedMs, splitMs: v.elapsedMs - prevTotal }
            ]
            timers.update(id, { laps })
          }
          break
        case 'cancel':
          timers.update(id, { state: 'cancelled', startedAt: null })
          break
        case 'rename':
          timers.update(id, { label: String(value ?? '').slice(0, 80) || null })
          break
        default:
          throw Object.assign(new Error(`Unknown timer op "${op}"`), { code: 'INVALID' })
      }
      arm()
      const out = timerView(timers.get(id), now())
      emit()
      return out
    },

    // --- pomodoro ---------------------------------------------------------------------------
    getPomodoro: pomodoroView,
    startPomodoro() {
      const cur = pomo.get()
      if (cur?.active && cur.timerId)
        timers.update(cur.timerId, { state: 'cancelled', startedAt: null })
      const t = startPhase('focus', 1)
      arm()
      emit()
      return timerView(t, now())
    },
    skipPomodoro() {
      const p = pomo.get()
      if (!p?.active || !p.timerId) return null
      timers.update(p.timerId, { state: 'cancelled', startedAt: null })
      advancePomodoro(p.timerId, false)
      arm()
      emit()
      return pomodoroView()
    },
    stopPomodoro() {
      const p = pomo.get()
      if (p?.timerId) timers.update(p.timerId, { state: 'cancelled', startedAt: null })
      pomo.stop()
      arm()
      emit()
    },

    // --- reminders --------------------------------------------------------------------------
    createReminder({ text, remindAt, repeat }) {
      const r = reminders.create({ text, remindAt, repeat, now: now() })
      arm()
      emit()
      return r
    },
    updateReminder(id, fields) {
      if (!reminders.get(id))
        throw Object.assign(new Error('Reminder not found'), { code: 'NOT_FOUND' })
      const patch = { ...fields }
      if ('remindAt' in patch || 'text' in patch || 'repeat' in patch) patch.state = 'pending'
      const r = reminders.update(id, patch)
      arm()
      emit()
      return r
    },
    snoozeReminder(id, minutes = 10) {
      const r = reminders.get(id)
      if (!r) throw Object.assign(new Error('Reminder not found'), { code: 'NOT_FOUND' })
      const at = now() + minutes * 60_000
      // Repeating reminders already advanced to their next occurrence: snooze as a one-off.
      const out = r.repeat
        ? reminders.create({ text: r.text, remindAt: at, now: now() })
        : reminders.update(id, { remindAt: at, state: 'snoozed' })
      arm()
      emit()
      return out
    },
    doneReminder(id) {
      const r = reminders.get(id)
      if (!r) return null
      const out = r.repeat ? r : reminders.update(id, { state: 'done' })
      arm()
      emit()
      return out
    },
    deleteReminder(id) {
      const ok = reminders.delete(id)
      arm()
      emit()
      return ok
    },
    getReminder: (id) => reminders.get(id),
    listReminders: (limit) => reminders.list(limit),
    clearReminders() {
      const n = reminders.clear()
      arm()
      emit()
      return n
    }
  }
  return api
}
