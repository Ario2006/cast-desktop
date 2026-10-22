import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { useFooterHints } from '../hooks/useWidget'
import { useStore } from '../store/useStore'
import styles from './widgets.module.css'

const SAVE_DELAY = 500

export default function NoteWidget({ params }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState(params.body ?? '')
  const [state, setState] = useState(params.noteId ? 'loading' : 'idle') // idle | saving | saved | loading | error
  const noteId = useRef(params.noteId ?? null)
  const latest = useRef({ title: '', body: params.body ?? '' })
  const timer = useRef(null)
  const chain = useRef(Promise.resolve())
  const dirty = useRef(Boolean(params.body)) // prefilled text from "note …" should be saved
  const areaRef = useRef(null)

  const save = () => {
    clearTimeout(timer.current)
    if (!dirty.current) return chain.current
    const snapshot = { ...latest.current }
    if (!snapshot.body.trim() && !noteId.current) return chain.current
    dirty.current = false
    chain.current = chain.current.then(async () => {
      try {
        setState('saving')
        if (noteId.current) {
          await api.notes.update({
            id: noteId.current,
            title: snapshot.title || undefined,
            body: snapshot.body
          })
        } else {
          const n = await api.notes.create({
            title: snapshot.title || undefined,
            body: snapshot.body
          })
          noteId.current = n.id
        }
        setState('saved')
      } catch {
        dirty.current = true
        setState('error')
      }
    })
    return chain.current
  }

  const schedule = () => {
    dirty.current = true
    setState('idle')
    clearTimeout(timer.current)
    timer.current = setTimeout(save, SAVE_DELAY)
  }

  useEffect(() => {
    if (params.noteId) {
      api.notes
        .get(params.noteId)
        .then((n) => {
          latest.current = { title: n.title ?? '', body: n.body }
          setTitle(n.title ?? '')
          setBody(n.body)
          setState('saved')
        })
        .catch(() => setState('error'))
    } else if (params.body) {
      timer.current = setTimeout(save, SAVE_DELAY)
    }
    areaRef.current?.focus()
    const len = areaRef.current?.value.length ?? 0
    areaRef.current?.setSelectionRange(len, len)
    return () => {
      save() // flush on close / hide
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useFooterHints([
    ['⌘↵', 'Save & close'],
    ['⌘⌫', 'Delete']
  ])

  const onKey = async (e) => {
    if (e.metaKey && e.key === 'Enter') {
      e.preventDefault()
      await save()
      useStore.getState().hide()
    } else if (e.metaKey && e.key === 'Backspace' && noteId.current) {
      e.preventDefault()
      dirty.current = false
      await api.notes.delete(noteId.current)
      noteId.current = null
      useStore.getState().closeWidget()
      useStore.getState().showToast('Note deleted')
    }
  }

  const label = {
    idle: 'Unsaved…',
    saving: 'Saving…',
    saved: 'Saved',
    loading: 'Loading…',
    error: 'Could not save'
  }[state]

  return (
    <div className={styles.widget} onKeyDown={onKey}>
      <input
        className={styles.text}
        placeholder="Title (optional)"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value)
          latest.current.title = e.target.value
          schedule()
        }}
      />
      <textarea
        ref={areaRef}
        className={styles.area}
        placeholder="Write something…"
        value={body}
        onChange={(e) => {
          setBody(e.target.value)
          latest.current.body = e.target.value
          schedule()
        }}
      />
      <div className={styles.inline}>
        <span
          className={`${styles.status} ${state === 'saved' ? styles.ok : ''} ${state === 'error' ? styles.err : ''}`}
        >
          {label}
        </span>
        <span className={styles.spacer} />
        <button
          className={`${styles.btn} ${styles.primary}`}
          onClick={async () => {
            await save()
            useStore.getState().hide()
          }}
        >
          Save &amp; close <kbd>⌘↵</kbd>
        </button>
      </div>
    </div>
  )
}
