import { useEffect, useMemo, useRef, useState } from 'react'
import { parseEventEdit } from '@shared/editParse'
import { formatWhen } from '@shared/timeparse'
import { UNDO_WINDOW_MS } from '@shared/constants'
import { api } from '../api'
import { useNow } from '../hooks/useNow'
import { useFooterHints } from '../hooks/useWidget'
import { useStore } from '../store/useStore'
import Icon from '../components/Icon'
import styles from './widgets.module.css'

const pad = (n) => String(n).padStart(2, '0')
const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const timeStr = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone

function initialTimes(params, defaultMinutes) {
  let start
  if (params.start) start = new Date(params.start)
  else {
    start = new Date()
    start.setMinutes(0, 0, 0)
    start.setHours(start.getHours() + 1)
  }
  let end
  if (params.end) end = new Date(params.end)
  else end = new Date(start.getTime() + (params.durationMinutes ?? defaultMinutes) * 60_000)
  return { start, end }
}

const ERROR_TEXT = {
  OFFLINE: "You're offline — Google Calendar needs a connection.",
  QUOTA: 'Google Calendar quota reached. Try again in a moment.'
}

export default function CalendarWidget({ params }) {
  const settings = useStore((s) => s.settings)
  const initial = useMemo(() => initialTimes(params, settings.defaultEventMinutes), []) // eslint-disable-line react-hooks/exhaustive-deps
  const [phase, setPhase] = useState('loading') // loading | unconfigured | disconnected | form | done | undone
  const [calendars, setCalendars] = useState([])
  const [title, setTitle] = useState(params.title ?? '')
  const [date, setDate] = useState(dateStr(initial.start))
  const [start, setStart] = useState(timeStr(initial.start))
  const [end, setEnd] = useState(timeStr(initial.end))
  const [calendarId, setCalendarId] = useState(params.calendarId ?? settings.calendarDefaultId)
  const [location, setLocation] = useState(params.location ?? '')
  const [attendees, setAttendees] = useState((params.attendees ?? []).join(', '))
  const [meet, setMeet] = useState(params.addMeetLink ?? settings.calendarMeetDefault)
  const [conflicts, setConflicts] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [createdAt, setCreatedAt] = useState(0)
  const formRef = useRef(null)
  const [quick, setQuick] = useState('')
  const [quickMiss, setQuickMiss] = useState(false)

  const startIso = useMemo(() => new Date(`${date}T${start}`), [date, start])
  const endIso = useMemo(() => new Date(`${date}T${end}`), [date, end])
  const valid =
    title.trim() &&
    !Number.isNaN(startIso.getTime()) &&
    !Number.isNaN(endIso.getTime()) &&
    endIso > startIso

  const load = async () => {
    setError(null)
    try {
      const status = await api.calendar.status()
      if (!status.configured) return setPhase('unconfigured')
      if (!status.connected) return setPhase('disconnected')
      setPhase('form')
      api.calendar
        .calendars()
        .then(setCalendars)
        .catch((e) => handleError(e, true))
    } catch (e) {
      setError(e.message)
      setPhase('disconnected')
    }
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleError(e, soft = false) {
    if (e.code === 'RECONNECT') {
      setPhase('disconnected')
      setError('Your Google session expired — reconnect to continue.')
    } else if (!soft) setError(ERROR_TEXT[e.code] ?? e.message)
  }

  // Overlap warning (debounced).
  useEffect(() => {
    if (phase !== 'form' || !valid) return setConflicts([])
    const t = setTimeout(() => {
      api.calendar
        .conflicts({ start: startIso.toISOString(), end: endIso.toISOString(), calendarId })
        .then(setConflicts)
        .catch(() => setConflicts([]))
    }, 450)
    return () => clearTimeout(t)
  }, [phase, valid, startIso, endIso, calendarId])

  const connect = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.calendar.connect()
      await load()
    } catch (e) {
      setError(e.code === 'TIMEOUT' ? 'Timed out waiting for Google.' : e.message)
    } finally {
      setBusy(false)
    }
  }

  const create = async () => {
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    try {
      const ev = await api.calendar.create({
        title: title.trim(),
        start: startIso.toISOString(),
        end: endIso.toISOString(),
        calendarId,
        location: location.trim() || undefined,
        attendees: attendees.split(/[,\s]+/).filter((a) => a.includes('@')),
        addMeetLink: meet || undefined
      })
      setResult(ev)
      setCreatedAt(Date.now())
      setPhase('done')
      useStore.getState().refreshHistory()
    } catch (e) {
      handleError(e)
    } finally {
      setBusy(false)
    }
  }

  const undo = async () => {
    try {
      await api.calendar.undo(result.id, result.calendarId)
      setPhase('undone')
    } catch (e) {
      setError(
        e.code === 'EXPIRED' ? 'Too late to undo — delete it in Google Calendar.' : e.message
      )
    }
  }

  const now = useNow(250, phase === 'done')
  const undoLeft = Math.max(0, UNDO_WINDOW_MS - (now - createdAt))

  useFooterHints(
    phase === 'form'
      ? [
          ['↵', 'Create'],
          ['⇥', 'Next field']
        ]
      : []
  )

  const onKey = (e) => {
    if (phase === 'form' && e.key === 'Enter' && !(e.target instanceof HTMLSelectElement)) {
      e.preventDefault()
      create()
    }
  }

  if (phase === 'loading')
    return (
      <div className={styles.widget}>
        <div className={styles.sub}>Checking Google Calendar…</div>
      </div>
    )

  if (phase === 'unconfigured') {
    return (
      <div className={styles.widget}>
        <div className={styles.big}>Set up Google Calendar</div>
        <div className={styles.sub}>
          Create a Desktop-type OAuth client in Google Cloud Console, then paste its client ID in
          Settings → Calendar.
        </div>
        <div className={styles.controls} style={{ justifyContent: 'flex-start' }}>
          <button
            className={`${styles.btn} ${styles.primary}`}
            onClick={() => useStore.getState().openSettings('calendar')}
          >
            Open Settings
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'disconnected') {
    return (
      <div className={styles.widget}>
        <div className={styles.big}>Connect Google Calendar</div>
        <div className={styles.sub}>
          Cast opens your browser to sign in. Only event access is requested.
        </div>
        {error && <div className={styles.err}>{error}</div>}
        <div className={styles.controls} style={{ justifyContent: 'flex-start' }}>
          <button className={`${styles.btn} ${styles.primary}`} onClick={connect} disabled={busy}>
            {busy ? 'Waiting for browser…' : 'Connect Google'}
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'done' || phase === 'undone') {
    return (
      <div className={styles.widget}>
        <div className={styles.success}>
          <span className={styles.successIcon}>
            <Icon name={phase === 'done' ? 'check' : 'undo'} size={18} strokeWidth={2.4} />
          </span>
          <div>
            <div className={styles.big}>{phase === 'done' ? 'Event created' : 'Event removed'}</div>
            <div className={styles.sub}>
              {title} · {formatWhen(startIso)}
              {result?.meetLink ? ' · Meet link added' : ''}
            </div>
          </div>
        </div>
        {error && <div className={styles.err}>{error}</div>}
        <div className={styles.controls} style={{ justifyContent: 'flex-start' }}>
          {phase === 'done' && result?.htmlLink && (
            <button
              className={`${styles.btn} ${styles.primary}`}
              onClick={() => api.actions.run('web.openUrl', { url: result.htmlLink })}
            >
              Open in Google Calendar
            </button>
          )}
          {phase === 'done' && undoLeft > 0 && (
            <button className={styles.btn} onClick={undo}>
              Undo ({Math.ceil(undoLeft / 1000)}s)
            </button>
          )}
          <span className={styles.spacer} />
          <button className={styles.btn} onClick={() => useStore.getState().hide()}>
            Close
          </button>
        </div>
      </div>
    )
  }

  // "move to 4pm", "tomorrow 2pm", "for 90 minutes": adjusts the date / time / length in place
  const applyQuick = () => {
    const r = parseEventEdit(quick, { start: startIso, end: endIso })
    setQuickMiss(!r)
    if (!r) return
    setDate(dateStr(r.start))
    setStart(timeStr(r.start))
    setEnd(timeStr(r.end))
    setQuick('')
  }

  return (
    <div className={styles.widget} ref={formRef} onKeyDown={onKey}>
      <label className={styles.field}>
        <span className={styles.label}>Title</span>
        <input
          className={styles.text}
          autoFocus={!title}
          value={title}
          placeholder="Event title"
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <div className={styles.grid}>
        <label className={styles.field}>
          <span className={styles.label}>Date</span>
          <input
            type="date"
            className={styles.text}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Start</span>
          <input
            type="time"
            className={styles.text}
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>End</span>
          <input
            type="time"
            className={styles.text}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
      </div>
      <div className={styles.grid2}>
        <label className={styles.field}>
          <span className={styles.label}>Calendar</span>
          <select
            className={styles.select}
            value={calendarId}
            onChange={(e) => setCalendarId(e.target.value)}
          >
            {!calendars.some((c) => c.id === calendarId) && (
              <option value={calendarId}>
                {calendarId === 'primary' ? 'Primary' : calendarId}
              </option>
            )}
            {calendars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.primary ? ' (primary)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Location</span>
          <input
            className={styles.text}
            value={location}
            placeholder="Optional"
            onChange={(e) => setLocation(e.target.value)}
          />
        </label>
      </div>
      <label className={styles.field}>
        <span className={styles.label}>
          Quick edit {quickMiss && <span className={styles.err}>— couldn’t read that</span>}
        </span>
        <input
          className={styles.text}
          value={quick}
          placeholder="“move to 4pm”, “tomorrow 2pm”, “for 90 minutes”"
          onChange={(e) => {
            setQuick(e.target.value)
            setQuickMiss(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              e.stopPropagation() // Enter here edits the draft; it must not create the event
              applyQuick()
            }
          }}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Attendees</span>
        <input
          className={styles.text}
          value={attendees}
          placeholder="Optional · comma-separated emails"
          onChange={(e) => setAttendees(e.target.value)}
        />
      </label>
      {conflicts.length > 0 && (
        <div className={styles.warn}>
          Overlaps with{' '}
          {conflicts
            .slice(0, 2)
            .map((c) => `“${c.title}”`)
            .join(', ')}
          {conflicts.length > 2 ? ` +${conflicts.length - 2} more` : ''}
        </div>
      )}
      {!valid && title.trim() && (
        <div className={styles.warn}>End time must be after the start time.</div>
      )}
      {error && <div className={styles.err}>{error}</div>}
      <div className={styles.inline}>
        <label className={styles.check}>
          <input type="checkbox" checked={meet} onChange={(e) => setMeet(e.target.checked)} /> Add
          Google Meet
        </label>
        <span className={styles.status}>{tz}</span>
        <span className={styles.spacer} />
        <button
          className={`${styles.btn} ${styles.primary}`}
          onClick={create}
          disabled={!valid || busy}
        >
          {busy ? 'Creating…' : 'Create event'} <kbd>↵</kbd>
        </button>
      </div>
    </div>
  )
}
