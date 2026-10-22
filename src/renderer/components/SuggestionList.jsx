import { Fragment, memo, useEffect, useRef } from 'react'
import { formatClock } from '@shared/durations'
import { useNow, timerLive } from '../hooks/useNow'
import { runSuggestion } from '../store/run'
import { useStore } from '../store/useStore'
import Icon, { toneFor } from './Icon'
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
      <span className={styles.tile} data-tone={toneFor(icon)}>
        <Icon name={icon} size={17} />
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

export default function SuggestionList() {
  const suggestions = useStore((s) => s.suggestions)
  const selected = useStore((s) => s.selected)
  const query = useStore((s) => s.query)
  const select = useStore((s) => s.select)

  if (!suggestions.length) {
    return (
      <div className={styles.empty}>
        {query.trim() ? (
          'No matches.'
        ) : (
          <>
            Try <kbd>25m</kbd>, <kbd>12*(3+4)</kbd>, <kbd>5 miles in km</kbd>,{' '}
            <kbd>remind me to call mom tomorrow at 5pm</kbd> or <kbd>screenshot</kbd>.
          </>
        )}
      </div>
    )
  }

  let lastSection = null
  return (
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
  )
}
