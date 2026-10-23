import { useEffect, useRef, useState } from 'react'
import { parseReminderEdit } from '@shared/editParse'
import { formatWhen, parseWhen } from '@shared/timeparse'
import { api } from '../api'
import { isEditable, pinWidgetParams, useFooterHints } from '../hooks/useWidget'
import { useStore } from '../store/useStore'
import Icon from '../components/Icon'
import styles from './widgets.module.css'

const toInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function ReminderWidget({ params }) {
  const [reminder, setReminder] = useState(null) // saved reminder (from main)
  const [editing, setEditing] = useState(!params.reminderId && !(params.text && params.remindAt))
  const [text, setText] = useState(params.text ?? '')
  const [when, setWhen] = useState(params.remindAt ? toInput(params.remindAt) : '')
  const [whenText, setWhenText] = useState('')
  const [repeat, setRepeat] = useState(params.repeat ?? 'none')
  const [error, setError] = useState(null)
  const created = useRef(false)
  const [quick, setQuick] = useState('')
  const [quickMiss, setQuickMiss] = useState(false)

  const parsedFromText = whenText.trim() ? parseWhen(whenText) : null
  const effectiveWhen = parsedFromText ? toInput(parsedFromText.toISOString()) : when

  const apply = (r) => {
    setReminder(r)
    setText(r.text)
    setWhen(toInput(new Date(r.remindAt).toISOString()))
    setRepeat(r.repeat ?? 'none')
    setEditing(false)
    pinWidgetParams({ reminderId: r.id })
  }

  useEffect(() => {
    if (created.current) return
    if (params.reminderId) {
      created.current = true
      api.reminders
        .list()
        .then((all) => {
          const r = all.find((x) => x.id === params.reminderId)
          if (r) apply(r)
          else setError('Reminder not found')
        })
        .catch((e) => setError(e.message))
    } else if (params.text && params.remindAt) {
      created.current = true
      api.reminders
        .create({ text: params.text, remindAt: params.remindAt, repeat: params.repeat })
        .then(apply)
        .catch((e) => setError(e.message))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submit = async () => {
    setError(null)
    if (!text.trim()) return setError('What should I remind you about?')
    if (!effectiveWhen) return setError('Pick a time, e.g. "tomorrow 9am"')
    const remindAt = new Date(effectiveWhen).toISOString()
    try {
      apply(
        reminder
          ? await api.reminders.update({ id: reminder.id, text, remindAt, repeat })
          : await api.reminders.create({ text, remindAt, repeat })
      )
      useStore.getState().refreshHistory()
    } catch (e) {
      setError(e.message)
    }
  }

  const remove = async () => {
    const r = reminder
    if (r) await api.reminders.delete(r.id).catch(() => {})
    useStore.getState().closeWidget()
    useStore.getState().showToast(
      'Reminder deleted',
      'info',
      6000,
      r && {
        label: 'Undo',
        run: () =>
          api.reminders.create({
            text: r.text,
            remindAt: new Date(r.remindAt).toISOString(),
            repeat: r.repeat ?? undefined
          })
      }
    )
  }

  useFooterHints(
    editing
      ? [['↵', reminder ? 'Update' : 'Set reminder']]
      : [
          ['E', 'Edit'],
          ['⌘⌫', 'Delete']
        ]
  )

  const onKey = (e) => {
    if (editing && e.key === 'Enter') (e.preventDefault(), submit())
  }

  // Card view: E edits, ⌘⌫ deletes.
  useEffect(() => {
    if (editing) return
    const on = (e) => {
      if (e.key.toLowerCase() === 'e' && !e.metaKey && !isEditable(e.target))
        (e.preventDefault(), setEditing(true))
      else if (e.metaKey && e.key === 'Backspace' && !isEditable(e.target))
        (e.preventDefault(), remove())
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, reminder])

  if (!editing && reminder) {
    return (
      <div className={styles.widget} onKeyDown={onKey}>
        <div className={styles.success}>
          <span className={styles.successIcon}>
            <Icon name="check" size={18} strokeWidth={2.6} />
          </span>
          <div>
            <div className={styles.big}>{reminder.text}</div>
            <div className={styles.sub}>
              {formatWhen(reminder.remindAt)}
              {reminder.repeat ? ` · repeats ${reminder.repeat}` : ''}
            </div>
          </div>
        </div>
        <input
          className={`${styles.text} ${styles.quick}`}
          value={quick}
          aria-label="Change reminder"
          placeholder={
            quickMiss
              ? 'Couldn’t read that — try “tomorrow 9am”'
              : 'Change it: “tomorrow 9am”, “in 2 hours”, “make it daily”'
          }
          onChange={(e) => {
            setQuick(e.target.value)
            setQuickMiss(false)
          }}
          onKeyDown={async (e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            const edit = parseReminderEdit(quick)
            setQuickMiss(!edit)
            if (!edit) return
            try {
              apply(
                await api.reminders.update({
                  id: reminder.id,
                  ...(edit.remindAt ? { remindAt: edit.remindAt.toISOString() } : {}),
                  ...(edit.repeat ? { repeat: edit.repeat } : {})
                })
              )
              setQuick('')
            } catch (err) {
              setError(err.message)
            }
          }}
        />
        <div className={styles.controls} style={{ justifyContent: 'flex-start' }}>
          <select
            className={styles.select}
            style={{ width: 118, height: 30, fontSize: 12.5 }}
            value=""
            aria-label="Snooze"
            onChange={async (e) => {
              const minutes = Number(e.target.value)
              if (!minutes) return
              try {
                apply(await api.reminders.snooze(reminder.id, minutes))
              } catch (err) {
                setError(err.message)
              }
            }}
          >
            <option value="">Snooze…</option>
            <option value="5">5 minutes</option>
            <option value="10">10 minutes</option>
            <option value="60">1 hour</option>
            <option value="180">3 hours</option>
          </select>
          <button className={styles.btn} onClick={() => setEditing(true)}>
            Edit <kbd>E</kbd>
          </button>
          <button className={`${styles.btn} ${styles.danger}`} onClick={remove}>
            Delete
          </button>
          <span className={styles.spacer} />
          <button
            className={`${styles.btn} ${styles.primary}`}
            onClick={() => useStore.getState().hide()}
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.widget} onKeyDown={onKey}>
      <label className={styles.field}>
        <span className={styles.label}>Remind me to</span>
        <input
          className={styles.text}
          autoFocus={!text}
          value={text}
          placeholder="Call mom"
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <div className={styles.grid2}>
        <label className={styles.field}>
          <span className={styles.label}>
            When{' '}
            {parsedFromText && <span className={styles.ok}>→ {formatWhen(parsedFromText)}</span>}
          </span>
          <input
            className={styles.text}
            autoFocus={Boolean(text)}
            value={whenText}
            placeholder={effectiveWhen ? formatWhen(effectiveWhen) : 'tomorrow 9am, in 20 min…'}
            onChange={(e) => setWhenText(e.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Exact time</span>
          <input
            type="datetime-local"
            className={styles.text}
            value={effectiveWhen}
            onChange={(e) => {
              setWhenText('')
              setWhen(e.target.value)
            }}
          />
        </label>
      </div>
      <div className={styles.inline}>
        <label className={styles.check}>
          Repeat
          <select
            className={styles.select}
            style={{ width: 120 }}
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
          >
            <option value="none">Never</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </label>
        <span className={styles.spacer} />
        {error && <span className={styles.err}>{error}</span>}
        <button className={`${styles.btn} ${styles.primary}`} onClick={submit}>
          {reminder ? 'Update' : 'Set reminder'} <kbd>↵</kbd>
        </button>
      </div>
    </div>
  )
}
