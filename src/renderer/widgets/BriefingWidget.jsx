import { useEffect } from 'react'
import { formatClock } from '@shared/durations'
import { api } from '../api'
import { timerLive, useNow } from '../hooks/useNow'
import { useStore } from '../store/useStore'
import styles from './widgets.module.css'

const time = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const greeting = (h = new Date().getHours()) =>
  h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'

export default function BriefingWidget() {
  const b = useStore((s) => s.briefing)
  const now = useNow(1000, Boolean(b?.timers?.length || b?.tracking))
  useEffect(() => {
    useStore.getState().loadBriefing()
  }, [])
  const st = () => useStore.getState()
  if (!b)
    return (
      <div className={styles.widget}>
        <div className={styles.empty}>Getting your day…</div>
      </div>
    )
  const date = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
  return (
    <div className={styles.widget}>
      <div>
        <div className={styles.big}>{greeting()}</div>
        <div className={styles.status}>
          {date}
          {b.weather ? ` · ${b.weather.title}` : ''}
        </div>
      </div>
      <div>
        <div className={styles.groupLabel}>Calendar</div>
        {b.events == null ? (
          <button className={styles.linkBtn} onClick={() => st().openWidget('calendar.agenda', {})}>
            Connect Google Calendar to see your day →
          </button>
        ) : b.events.length === 0 ? (
          <div className={styles.status} style={{ padding: '2px 10px' }}>
            Nothing else scheduled today.
          </div>
        ) : (
          b.events.map((e) => (
            <div
              key={e.id + e.start}
              className={styles.event}
              onClick={() =>
                (e.link || e.htmlLink) &&
                api.actions.run('web.openUrl', { url: e.link || e.htmlLink })
              }
            >
              <span className={styles.eventTime}>{e.allDay ? 'All day' : time(e.start)}</span>
              <span className={styles.eventMain}>
                <span className={styles.resultTitle}>{e.title}</span>
                {e.link && <span className={styles.resultSub}>Video call · click to join</span>}
              </span>
            </div>
          ))
        )}
      </div>
      <div>
        <div className={styles.groupLabel}>Due today</div>
        {b.tasks.length === 0 && b.reminders.length === 0 ? (
          <div className={styles.status} style={{ padding: '2px 10px' }}>
            Nothing due. Add one with “todo …”.
          </div>
        ) : (
          <>
            {b.tasks.map((t) => (
              <div
                key={`t${t.id}`}
                className={styles.item}
                onClick={() => st().openWidget('tasks.open', {})}
              >
                <span className={styles.itemMain}>
                  <span className={styles.itemTitle}>{t.text}</span>
                  <span className={`${styles.itemSub} ${t.due < Date.now() ? styles.overdue : ''}`}>
                    {t.due < Date.now() ? 'Overdue' : `Due ${time(t.due)}`}
                  </span>
                </span>
              </div>
            ))}
            {b.reminders.map((r) => (
              <div key={`r${r.id}`} className={styles.item}>
                <span className={styles.itemMain}>
                  <span className={styles.itemTitle}>{r.text}</span>
                  <span className={styles.itemSub}>Reminder · {time(r.remindAt)}</span>
                </span>
              </div>
            ))}
          </>
        )}
      </div>
      {(b.timers.length > 0 || b.tracking) && (
        <div>
          <div className={styles.groupLabel}>Running</div>
          {b.tracking && (
            <div className={styles.item} onClick={() => st().openWidget('time.report', {})}>
              <span className={styles.itemMain}>
                <span className={styles.itemTitle}>Tracking “{b.tracking.project}”</span>
                <span className={styles.itemSub}>{formatClock(now - b.tracking.startedAt)}</span>
              </span>
            </div>
          )}
          {b.timers.map((t) => (
            <div
              key={t.id}
              className={styles.item}
              onClick={() =>
                st().openWidget(t.kind === 'timer' ? 'timer.start' : 'stopwatch.start', {
                  timerId: t.id
                })
              }
            >
              <span className={styles.itemMain}>
                <span className={styles.itemTitle}>
                  {t.label || (t.kind === 'timer' ? 'Timer' : 'Stopwatch')}
                </span>
                <span className={styles.itemSub}>
                  {formatClock(
                    t.kind === 'timer' ? timerLive(t, now).remainingMs : timerLive(t, now).elapsedMs
                  )}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
