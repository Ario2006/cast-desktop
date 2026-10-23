import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { isEditable, useFooterHints, useWidgetKeys } from '../hooks/useWidget'
import { useStore } from '../store/useStore'
import styles from './widgets.module.css'

const fmt = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const range = (e) => (e.allDay ? 'All day' : `${fmt(e.start)} – ${fmt(e.end)}`)

export default function AgendaWidget({ params }) {
  const [day, setDay] = useState(params.day ?? 'today')
  const [state, setState] = useState({ phase: 'loading' }) // loading | ready | setup | connect | error
  const [events, setEvents] = useState([])

  const load = useCallback(async () => {
    setState({ phase: 'loading' })
    try {
      const status = await api.calendar.status()
      if (!status.configured) return setState({ phase: 'setup' })
      if (!status.connected) return setState({ phase: 'connect' })
      const r = await api.calendar.agenda(day)
      setEvents(r.events)
      setState({ phase: 'ready' })
    } catch (e) {
      if (e.code === 'RECONNECT')
        setState({ phase: 'connect', message: 'Your Google session expired — reconnect.' })
      else
        setState({ phase: 'error', message: e.code === 'OFFLINE' ? "You're offline." : e.message })
    }
  }, [day])
  useEffect(() => {
    load()
  }, [load])

  useWidgetKeys((e) => {
    if (isEditable(e.target) || e.metaKey) return false
    if (e.key === 'ArrowRight') return (setDay('tomorrow'), true)
    if (e.key === 'ArrowLeft') return (setDay('today'), true)
    return false
  })
  useFooterHints([['←→', 'Today / Tomorrow']])

  const connect = async () => {
    try {
      await api.calendar.connect()
      load()
    } catch (e) {
      setState({ phase: 'error', message: e.message })
    }
  }

  const header = (
    <div className={styles.segmented} role="group" aria-label="Day">
      {['today', 'tomorrow'].map((d) => (
        <button key={d} aria-pressed={day === d} onClick={() => setDay(d)}>
          {d === 'today' ? 'Today' : 'Tomorrow'}
        </button>
      ))}
    </div>
  )

  if (state.phase === 'setup' || state.phase === 'connect') {
    return (
      <div className={styles.widget}>
        <div className={styles.big}>
          {state.phase === 'setup' ? 'Set up Google Calendar' : 'Connect Google Calendar'}
        </div>
        <div className={styles.note}>
          {state.message ??
            (state.phase === 'setup'
              ? 'Add your Google OAuth client ID in Settings → Calendar first.'
              : 'Cast reads your events to show the day. Sign in through your browser.')}
        </div>
        <div className={styles.controls} style={{ justifyContent: 'flex-start' }}>
          {state.phase === 'setup' ? (
            <button
              className={`${styles.btn} ${styles.primary}`}
              onClick={() => useStore.getState().openSettings('calendar')}
            >
              Open Settings
            </button>
          ) : (
            <button className={`${styles.btn} ${styles.primary}`} onClick={connect}>
              Connect Google
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.widget}>
      {header}
      {state.phase === 'loading' && <div className={styles.empty}>Loading…</div>}
      {state.phase === 'error' && <div className={styles.err}>{state.message}</div>}
      {state.phase === 'ready' &&
        (events.length === 0 ? (
          <div className={styles.empty}>
            Nothing scheduled {day === 'today' ? 'today' : 'tomorrow'}.
          </div>
        ) : (
          <ul className={styles.results} role="list">
            {events.map((e) => (
              <li
                key={e.id + e.start}
                className={styles.event}
                onClick={() => e.htmlLink && api.actions.run('web.openUrl', { url: e.htmlLink })}
              >
                <span className={styles.eventTime}>{range(e)}</span>
                <span className={styles.eventMain}>
                  <span className={styles.resultTitle}>{e.title}</span>
                  <span className={styles.resultSub}>
                    {[e.location, e.calendar].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ))}
    </div>
  )
}
