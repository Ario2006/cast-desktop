import { Fragment, memo, useEffect, useRef } from 'react'
import { formatClock } from '@shared/durations'
import { useNow, timerLive } from '../hooks/useNow'
import { runSuggestion } from '../store/run'
import { useStore } from '../store/useStore'
import Icon from './Icon'
import styles from './launcher.module.css'

const LiveSubtitle = ({ timerId, fallback }) => {
  const timer = useStore((s) => s.timers.find((t) => t.id === timerId))
  const now = useNow(1000, Boolean(timer))
  if (!timer) return fallback
  const live = timerLive(timer, now)
  const clock = formatClock(timer.kind === 'timer' ? live.remainingMs : live.elapsedMs)
  return `${clock}${timer.state === 'paused' ? ' · paused' : ''}`
}

const Row = memo(function Row({ s, index, selected, onHover }) {
  const ref = useRef(null)
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const icon =
    s.source === 'files' && s.actionId === 'file.open' && s.params.isDir ? 'folder' : s.icon
  return (
    <li
      ref={ref}
      role="option"
      aria-selected={selected}
      className={styles.row}
      onMouseMove={() => !selected && onHover(index)}
      onClick={() => runSuggestion(s)}
    >
      <span className={styles.tile}>
        <Icon name={icon} size={17} strokeWidth={1.8} />
      </span>
      <span className={styles.text}>
        <span className={styles.title}>{s.title}</span>
        <span className={styles.subtitle}>
          {s.liveTimerId ? (
            <LiveSubtitle timerId={s.liveTimerId} fallback={s.subtitle} />
          ) : (
            s.subtitle
          )}
        </span>
      </span>
      <span className={styles.hint}>{selected ? '↵' : index < 7 ? `⌘${index + 1}` : ''}</span>
    </li>
  )
})

const EXAMPLES = [
  '25m',
  '12*(3+4)',
  '5 miles in km',
  'remind me to call mom tomorrow at 5pm',
  'screenshot'
]

const hhmm = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/** One-line daily briefing above the empty state: weather, next event, what's due. */
function BriefingStrip() {
  const b = useStore((s) => s.briefing)
  if (!b) return null
  const now = Date.now()
  const next = b.events?.find((e) => !e.allDay && Date.parse(e.end) > now)
  const due = b.tasks.length
  const parts = [
    <span key="d">
      {new Date().toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
    </span>,
    b.weather && <span key="w">{b.weather.short ?? b.weather.title}</span>,
    next && (
      <span key="e">
        Next: <b>{next.title}</b> {Date.parse(next.start) <= now ? 'now' : hhmm(next.start)}
      </span>
    ),
    due > 0 && (
      <span key="t">
        <b>{due}</b> task{due === 1 ? '' : 's'} due
      </span>
    ),
    b.tracking && (
      <span key="tr">
        Tracking <b>{b.tracking.project}</b>
      </span>
    )
  ].filter(Boolean)
  if (!parts.length) return null
  return (
    <button
      className={styles.briefing}
      onClick={() => useStore.getState().openWidget('briefing.show', {})}
      aria-label="Open daily briefing"
    >
      {parts.flatMap((p, i) =>
        i
          ? [
              <span key={`d${i}`} className={styles.dot}>
                ·
              </span>,
              p
            ]
          : [p]
      )}
    </button>
  )
}

function EmptyState({ hasQuery }) {
  if (hasQuery) return <div className={styles.noMatch}>No matches. Try rephrasing.</div>
  return (
    <div className={styles.empty}>
      <h2 className={styles.emptyTitle}>What do you want to do?</h2>
      <p className={styles.emptyText}>
        Timers, reminders, calendar, tasks, notes, weather, translations, dev tools and more — just
        describe it. Type <b>?</b> to see everything.
      </p>
      <div className={styles.examples}>
        {EXAMPLES.map((e) => (
          <button
            key={e}
            className={styles.example}
            onClick={() => useStore.getState().setQuery(e)}
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function SuggestionList() {
  const suggestions = useStore((s) => s.suggestions)
  const selected = useStore((s) => s.selected)
  const query = useStore((s) => s.query)
  const select = useStore((s) => s.select)

  if (!suggestions.length) {
    return (
      <>
        {!query.trim() && <BriefingStrip />}
        <EmptyState hasQuery={Boolean(query.trim())} />
      </>
    )
  }

  let lastSection = null
  return (
    <>
      {!query.trim() && <BriefingStrip />}
      <ul id="cast-results" role="listbox" className={styles.list}>
        {suggestions.map((s, i) => {
          const header = s.section && s.section !== lastSection ? s.section : null
          lastSection = s.section ?? lastSection
          return (
            <Fragment key={s.key}>
              {header && (
                <li className={styles.section} role="presentation">
                  {header}
                </li>
              )}
              <Row s={s} index={i} selected={i === selected} onHover={select} />
            </Fragment>
          )
        })}
      </ul>
    </>
  )
}
