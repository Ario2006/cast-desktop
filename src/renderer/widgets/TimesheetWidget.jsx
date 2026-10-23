import { useCallback, useEffect, useState } from 'react'
import { formatClock } from '@shared/durations'
import { api } from '../api'
import { useNow } from '../hooks/useNow'
import { useFooterHints } from '../hooks/useWidget'
import styles from './widgets.module.css'

const hm = (ms) => {
  const m = Math.round(ms / 60_000)
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`
}

function Totals({ label, rows }) {
  const max = Math.max(1, ...rows.map((r) => r.ms))
  const total = rows.reduce((a, b) => a + b.ms, 0)
  return (
    <div>
      <div className={styles.groupLabel}>
        {label} · {hm(total)}
      </div>
      {rows.length === 0 ? (
        <div className={styles.status} style={{ padding: '2px 10px' }}>
          Nothing tracked yet.
        </div>
      ) : (
        rows.map((r) => (
          <div key={r.project} className={styles.barRow}>
            <span className={styles.itemTitle}>{r.project}</span>
            <span>
              <i
                className={styles.bar}
                style={{ display: 'block', width: `${(r.ms / max) * 100}%` }}
              />
            </span>
            <span className={styles.status}>{hm(r.ms)}</span>
          </div>
        ))
      )}
    </div>
  )
}

export default function TimesheetWidget() {
  const [data, setData] = useState(null)
  const [project, setProject] = useState('')
  const [error, setError] = useState(null)
  const now = useNow(1000, Boolean(data?.running))

  const load = useCallback(
    () =>
      api.time
        .status()
        .then(setData)
        .catch((e) => setError(e.message)),
    []
  )
  useEffect(() => {
    load()
  }, [load])
  const start = async (name) => {
    if (!name.trim()) return
    setData(await api.time.start(name.trim()))
    setProject('')
  }
  useFooterHints(data?.running ? [] : [['↵', 'Start tracking']])

  return (
    <div className={styles.widget}>
      {data?.running ? (
        <div className={styles.inline}>
          <span className={styles.itemMain}>
            <span className={styles.status}>Tracking</span>
            <span className={styles.big}>{data.running.project}</span>
          </span>
          <span className={styles.clockSm} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatClock(now - data.running.startedAt)}
          </span>
          <button
            className={`${styles.btn} ${styles.danger}`}
            onClick={async () => setData(await api.time.stop())}
          >
            Stop
          </button>
        </div>
      ) : (
        <div className={styles.inline}>
          <input
            className={styles.text}
            autoFocus
            value={project}
            placeholder="What are you working on?"
            aria-label="Project to track"
            onChange={(e) => setProject(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), start(project))}
          />
          <button
            className={`${styles.btn} ${styles.primary}`}
            onClick={() => start(project)}
            disabled={!project.trim()}
          >
            Start
          </button>
        </div>
      )}
      {data?.projects?.length > 0 && !data.running && (
        <div className={styles.chips}>
          {data.projects.map((p) => (
            <button key={p} className={styles.chip} onClick={() => start(p)}>
              {p}
            </button>
          ))}
        </div>
      )}
      {data && (
        <>
          <Totals label="Today" rows={data.today} />
          <Totals label="This week" rows={data.week} />
        </>
      )}
      {error && <div className={styles.err}>{error}</div>}
    </div>
  )
}
