import { useEffect, useState } from 'react'
import { api } from '../api'
import { useStore } from '../store/useStore'
import styles from './widgets.module.css'

const hm = (ms) => {
  const m = Math.round(ms / 60_000)
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`
}
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function InsightsWidget() {
  const [data, setData] = useState(null)
  const keepHistory = useStore((s) => s.settings.keepHistory)
  useEffect(() => {
    api.overview
      .insights()
      .then(setData)
      .catch(() => setData(null))
  }, [])
  if (!data)
    return (
      <div className={styles.widget}>
        <div className={styles.empty}>Loading…</div>
      </div>
    )
  const max = Math.max(1, ...data.byDay)
  const today = new Date().getDay()
  return (
    <div className={styles.widget}>
      <div className={styles.inline}>
        <span className={styles.big}>Your last 7 days</span>
        <span className={styles.spacer} />
        <span className={styles.status}>Computed on this Mac only</span>
      </div>
      <div className={styles.stats}>
        {[
          [data.total, 'actions'],
          [data.tasksDone, 'tasks done'],
          [data.timersFinished, 'timers'],
          [hm(data.trackedTotal), 'tracked']
        ].map(([v, l]) => (
          <div key={l} className={styles.stat}>
            <div className={styles.statValue}>{v}</div>
            <div className={styles.statLabel}>{l}</div>
          </div>
        ))}
      </div>
      {!keepHistory ? (
        <div className={styles.note}>
          Turn on “Keep action history” in Settings → Privacy to see which actions you use most.
        </div>
      ) : (
        <>
          <div className={styles.bars} aria-label="Actions per day">
            {data.byDay.map((n, i) => (
              <div key={i} className={styles.barCol} data-today={i === 6} title={`${n} actions`}>
                <i style={{ height: `${(n / max) * 56}px` }} />
                {DAYS[(today - 6 + i + 7) % 7]}
              </div>
            ))}
          </div>
          {data.top.length > 0 && (
            <div>
              <div className={styles.groupLabel}>Most used</div>
              {data.top.map((t) => (
                <div key={t.id} className={styles.barRow}>
                  <span className={styles.itemTitle}>{t.title}</span>
                  <span>
                    <i
                      className={styles.bar}
                      style={{ display: 'block', width: `${(t.count / data.top[0].count) * 100}%` }}
                    />
                  </span>
                  <span className={styles.status}>{t.count}×</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {data.tracked.length > 0 && (
        <div>
          <div className={styles.groupLabel}>Time tracked</div>
          {data.tracked.map((t) => (
            <div key={t.project} className={styles.barRow}>
              <span className={styles.itemTitle}>{t.project}</span>
              <span>
                <i
                  className={styles.bar}
                  style={{ display: 'block', width: `${(t.ms / data.tracked[0].ms) * 100}%` }}
                />
              </span>
              <span className={styles.status}>{hm(t.ms)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
