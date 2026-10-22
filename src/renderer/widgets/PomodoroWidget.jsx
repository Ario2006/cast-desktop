import { useState } from 'react'
import { formatClock } from '@shared/durations'
import { api } from '../api'
import { timerLive, useNow } from '../hooks/useNow'
import { isEditable, useFooterHints, useWidgetKeys } from '../hooks/useWidget'
import { useStore } from '../store/useStore'
import styles from './widgets.module.css'

export default function PomodoroWidget() {
  const pomo = useStore((s) => s.pomodoro)
  const settings = useStore((s) => s.settings)
  const [error, setError] = useState(null)
  const now = useNow(250, Boolean(pomo))

  const run = async (fn) => {
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e.message)
    }
  }
  const start = () => run(() => api.pomodoro.start())
  const toggle = () =>
    run(() => api.timers.control(pomo.timer.id, pomo.timer.state === 'paused' ? 'resume' : 'pause'))

  useWidgetKeys((e) => {
    if (isEditable(e.target) || e.metaKey) return false
    if (e.key === ' ' || e.key === 'Enter') return (pomo ? toggle() : start(), true)
    if (e.key.toLowerCase() === 's' && pomo) return (run(() => api.pomodoro.skip()), true)
    return false
  })
  useFooterHints(
    pomo
      ? [
          ['Space', 'Pause'],
          ['S', 'Skip']
        ]
      : [['↵', 'Start']]
  )

  if (!pomo) {
    return (
      <div className={`${styles.widget} ${styles.center}`}>
        <div className={styles.big}>Pomodoro</div>
        <div className={styles.note}>
          {settings.pomodoroFocusMinutes} min focus · {settings.pomodoroShortBreakMinutes} min break
          · a {settings.pomodoroLongBreakMinutes} min break after {settings.pomodoroCycles} rounds.
          <br />
          Runs in the background and notifies you at each switch.
        </div>
        <div className={styles.controls}>
          <button className={`${styles.btn} ${styles.primary}`} onClick={start}>
            Start focus <kbd>↵</kbd>
          </button>
        </div>
        {error && <div className={styles.err}>{error}</div>}
      </div>
    )
  }

  const isBreak = pomo.phase !== 'focus'
  const live = timerLive(pomo.timer, now)
  const paused = pomo.timer.state === 'paused'
  const pct = Math.min(100, (live.elapsedMs / pomo.timer.durationMs) * 100)

  return (
    <div className={`${styles.widget} ${styles.center}`}>
      <div className={styles.phase} data-break={isBreak}>
        {pomo.phase === 'focus' ? 'Focus' : pomo.phase === 'short' ? 'Short break' : 'Long break'}
      </div>
      <div className={styles.clock} data-paused={paused}>
        {formatClock(live.remainingMs)}
      </div>
      <div className={styles.progress}>
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className={styles.dots} aria-label={`Round ${pomo.cycle} of ${pomo.cycles}`}>
        {Array.from({ length: pomo.cycles }, (_, i) => (
          <span
            key={i}
            className={styles.dot}
            data-state={
              i + 1 < pomo.cycle || (i + 1 === pomo.cycle && isBreak)
                ? 'done'
                : i + 1 === pomo.cycle
                  ? 'current'
                  : ''
            }
          />
        ))}
      </div>
      <div className={styles.controls}>
        <button className={`${styles.btn} ${styles.primary}`} onClick={toggle}>
          {paused ? 'Resume' : 'Pause'} <kbd>Space</kbd>
        </button>
        <button className={styles.btn} onClick={() => run(() => api.pomodoro.skip())}>
          Skip <kbd>S</kbd>
        </button>
        <button
          className={`${styles.btn} ${styles.danger}`}
          onClick={async () => {
            await run(() => api.pomodoro.stop())
            useStore.getState().closeWidget()
          }}
        >
          Stop
        </button>
      </div>
      {error && <div className={styles.err}>{error}</div>}
    </div>
  )
}
