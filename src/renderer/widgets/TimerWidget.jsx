import { useEffect, useRef, useState } from 'react'
import { formatClock, parseTimerInput } from '@shared/durations'
import { parseTimerEdit } from '@shared/editParse'
import { api } from '../api'
import { timerLive, useNow } from '../hooks/useNow'
import { isEditable, pinWidgetParams, useFooterHints, useWidgetKeys } from '../hooks/useWidget'
import { useStore } from '../store/useStore'
import styles from './widgets.module.css'

const PRESETS = [
  ['1m', 60],
  ['5m', 300],
  ['10m', 600],
  ['15m', 900],
  ['25m', 1500],
  ['45m', 2700],
  ['1h', 3600]
]

const parseCustom = (text) => {
  const t = text.trim()
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(Number(t) * 60) // bare number = minutes
  return parseTimerInput(t)?.seconds ?? null
}

export default function TimerWidget({ params }) {
  const [timerId, setTimerId] = useState(params.timerId ?? null)
  const [local, setLocal] = useState(null)
  const [error, setError] = useState(null)
  const [custom, setCustom] = useState('')
  const [label, setLabel] = useState(params.label ?? '')
  const [edit, setEdit] = useState('')
  const started = useRef(false)

  const fromStore = useStore(
    (s) => s.timers.find((t) => t.id === timerId) ?? s.finishedTimers[timerId]
  )
  const timer = fromStore ?? (local?.id === timerId ? local : null)
  const running = timer?.state === 'running'
  const now = useNow(200, running)

  const begin = async (durationSeconds, lbl) => {
    if (started.current) return
    started.current = true
    try {
      const t = await api.timers.start({ kind: 'timer', durationSeconds, label: lbl || undefined })
      setLocal(t)
      setTimerId(t.id)
      setLabel(t.label ?? '')
      pinWidgetParams({ timerId: t.id })
    } catch (e) {
      started.current = false
      setError(e.message)
    }
  }

  useEffect(() => {
    if (params.durationSeconds && !params.timerId) begin(params.durationSeconds, params.label)
    else if (params.timerId && !fromStore)
      api.timers
        .get(params.timerId)
        .then(setLocal)
        .catch(() => setError('Timer not found'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const control = async (op, value) => {
    if (!timer) return
    try {
      setLocal(await api.timers.control(timer.id, op, value))
    } catch (e) {
      setError(e.message)
    }
  }

  const done =
    timer?.state === 'done' || (timer && running && timerLive(timer, now).remainingMs <= 0)
  const toggle = () =>
    timer?.state === 'paused' ? control('resume') : running ? control('pause') : null

  useWidgetKeys((e) => {
    if (!timer || isEditable(e.target) || e.metaKey) return false
    if (e.key === ' ' || e.key === 'Enter')
      return done ? (control('restart'), true) : (toggle(), true)
    if (e.key.toLowerCase() === 'r') return (control(done ? 'restart' : 'reset'), true)
    if (e.key === '+' || e.key === '=') return (control('add', 60_000), true)
    return false
  })
  useFooterHints(
    timer
      ? [
          ['Space', done ? 'Restart' : 'Pause'],
          ['R', 'Reset'],
          ['+', '+1 min']
        ]
      : [['↵', 'Start']]
  )

  // --- picker (no duration yet) ---------------------------------------------------------------
  if (!timer && !params.durationSeconds && !params.timerId) {
    const secs = parseCustom(custom)
    return (
      <div className={styles.widget}>
        <div className={styles.presets}>
          {PRESETS.map(([name, s]) => (
            <button key={name} className={styles.preset} onClick={() => begin(s, label)}>
              {name}
            </button>
          ))}
        </div>
        <div className={styles.grid2}>
          <label className={styles.field}>
            <span className={styles.label}>Custom</span>
            <input
              className={styles.text}
              autoFocus
              value={custom}
              placeholder="e.g. 12m, 1h 30m, 90s"
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && secs && begin(secs, label)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Label</span>
            <input
              className={styles.text}
              value={label}
              placeholder="Optional"
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
        </div>
        {error && <div className={styles.err}>{error}</div>}
        <div className={styles.status}>
          {secs ? `Starts a ${formatClock(secs * 1000)} timer` : 'Pick a preset or type a duration'}
        </div>
      </div>
    )
  }

  if (!timer)
    return (
      <div className={styles.widget}>
        {error ? (
          <div className={styles.err}>{error}</div>
        ) : (
          <div className={styles.sub}>Starting…</div>
        )}
      </div>
    )

  const live = timerLive(timer, now)
  const remaining = done ? 0 : live.remainingMs
  const pct = Math.min(100, (live.elapsedMs / timer.durationMs) * 100)

  return (
    <div className={`${styles.widget} ${styles.center}`}>
      <div className={styles.sub}>
        {done ? "Time's up" : timer.state === 'paused' ? 'Paused' : 'Timer'}
        {timer.label ? ` · ${timer.label}` : ''}
      </div>
      <div className={styles.clock} data-done={done} data-paused={timer.state === 'paused'}>
        {formatClock(remaining)}
      </div>
      <div className={styles.progress}>
        <i style={{ width: `${done ? 100 : pct}%` }} />
      </div>
      <div className={styles.controls}>
        {done ? (
          <button className={`${styles.btn} ${styles.primary}`} onClick={() => control('restart')}>
            Restart <kbd>Space</kbd>
          </button>
        ) : (
          <button className={`${styles.btn} ${styles.primary}`} onClick={toggle}>
            {timer.state === 'paused' ? 'Resume' : 'Pause'} <kbd>Space</kbd>
          </button>
        )}
        <button className={styles.btn} onClick={() => control('add', 60_000)}>
          +1 min <kbd>+</kbd>
        </button>
        <button className={styles.btn} onClick={() => control('reset')}>
          Reset <kbd>R</kbd>
        </button>
        <button
          className={`${styles.btn} ${styles.danger}`}
          onClick={async () => {
            await control('cancel')
            useStore.getState().closeWidget()
          }}
        >
          Cancel
        </button>
      </div>
      <input
        className={`${styles.text} ${styles.quick}`}
        value={edit}
        placeholder="Change it: “make it 30 min”, “add 5 min”, or type a label"
        aria-label="Edit timer"
        onChange={(e) => setEdit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          const cmd = parseTimerEdit(edit)
          if (!cmd) return
          setEdit('')
          if (cmd.op === 'set') control('setDuration', cmd.ms)
          else if (cmd.op === 'add') control('add', cmd.ms)
          else control('rename', cmd.label)
        }}
      />
      {error && <div className={styles.err}>{error}</div>}
    </div>
  )
}
