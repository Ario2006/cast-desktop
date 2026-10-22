import { useEffect, useRef, useState } from 'react'
import { formatStopwatch } from '@shared/durations'
import { api } from '../api'
import { timerLive, useNow } from '../hooks/useNow'
import { isEditable, pinWidgetParams, useFooterHints, useWidgetKeys } from '../hooks/useWidget'
import { useStore } from '../store/useStore'
import styles from './widgets.module.css'

export default function StopwatchWidget({ params }) {
  const [timerId, setTimerId] = useState(params.timerId ?? null)
  const [local, setLocal] = useState(null)
  const [error, setError] = useState(null)
  const started = useRef(false)

  const fromStore = useStore((s) => s.timers.find((t) => t.id === timerId))
  const timer = fromStore ?? (local?.id === timerId ? local : null)
  const running = timer?.state === 'running'
  const now = useNow(33, running)

  // Opening the stopwatch starts it immediately.
  useEffect(() => {
    if (started.current || params.timerId) return
    started.current = true
    api.timers
      .start({ kind: 'stopwatch', label: params.label })
      .then((t) => {
        setLocal(t)
        setTimerId(t.id)
        pinWidgetParams({ timerId: t.id })
      })
      .catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (params.timerId && !fromStore)
      api.timers
        .get(params.timerId)
        .then(setLocal)
        .catch(() => setError('Stopwatch not found'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const control = async (op) => {
    if (!timer) return
    try {
      setLocal(await api.timers.control(timer.id, op))
    } catch (e) {
      setError(e.message)
    }
  }
  const toggle = () => control(running ? 'pause' : 'resume')

  useWidgetKeys((e) => {
    if (!timer || isEditable(e.target) || e.metaKey) return false
    if (e.key === ' ' || e.key === 'Enter') return (toggle(), true)
    if (e.key.toLowerCase() === 'l') return (control('lap'), true)
    if (e.key.toLowerCase() === 'r') return (control('reset'), true)
    return false
  })
  useFooterHints([
    ['Space', 'Start/Pause'],
    ['L', 'Lap'],
    ['R', 'Reset']
  ])

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

  const elapsed = timerLive(timer, now).elapsedMs
  const laps = [...timer.laps].reverse()

  return (
    <div className={`${styles.widget} ${styles.center}`}>
      <div className={styles.sub}>{running ? 'Stopwatch' : 'Paused'}</div>
      <div className={styles.clock} data-paused={!running}>
        {formatStopwatch(elapsed)}
      </div>
      <div className={styles.controls}>
        <button className={`${styles.btn} ${styles.primary}`} onClick={toggle}>
          {running ? 'Pause' : 'Resume'} <kbd>Space</kbd>
        </button>
        <button className={styles.btn} onClick={() => control('lap')} disabled={!running}>
          Lap <kbd>L</kbd>
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
          Stop
        </button>
      </div>
      {laps.length > 0 && (
        <div className={styles.laps} role="list" aria-label="Laps">
          {laps.map((l) => (
            <div key={l.n} className={styles.lap} role="listitem">
              <span>Lap {l.n}</span>
              <span>+{formatStopwatch(l.splitMs)}</span>
              <span>{formatStopwatch(l.totalMs)}</span>
            </div>
          ))}
        </div>
      )}
      {error && <div className={styles.err}>{error}</div>}
    </div>
  )
}
