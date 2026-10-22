import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { useFooterHints } from '../hooks/useWidget'
import { useStore } from '../store/useStore'
import styles from './widgets.module.css'

const firstLine = (t) =>
  (t ?? '')
    .split('\n')
    .find((l) => l.trim())
    ?.trim() ?? 'Untitled'
const when = (ms) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

export default function NotesSearchWidget({ params }) {
  const [query, setQuery] = useState(params.query ?? '')
  const [notes, setNotes] = useState([])
  const [sel, setSel] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    const mine = ++seq.current
    const t = setTimeout(() => {
      api.notes
        .search(query, 20)
        .then((n) => {
          if (mine !== seq.current) return
          setNotes(n)
          setSel(0)
          setLoaded(true)
        })
        .catch(() => setLoaded(true))
    }, 100)
    return () => clearTimeout(t)
  }, [query])

  useFooterHints([
    ['↑↓', 'Navigate'],
    ['↵', 'Open']
  ])

  const open = (n) => n && useStore.getState().openWidget('note.create', { noteId: n.id })

  const onKey = (e) => {
    if (e.key === 'ArrowDown')
      (e.preventDefault(), setSel((s) => Math.min(notes.length - 1, s + 1)))
    else if (e.key === 'ArrowUp') (e.preventDefault(), setSel((s) => Math.max(0, s - 1)))
    else if (e.key === 'Enter') (e.preventDefault(), open(notes[sel]))
  }

  return (
    <div className={styles.widget}>
      <input
        className={styles.text}
        autoFocus
        placeholder={'Search notes…'}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKey}
      />
      {loaded && notes.length === 0 ? (
        <div className={styles.sub}>
          {query ? 'No notes match.' : 'No notes yet. Try “note buy milk”.'}
        </div>
      ) : (
        <ul className={styles.results} role="listbox">
          {notes.map((n, i) => (
            <li
              key={n.id}
              role="option"
              aria-selected={i === sel}
              className={styles.result}
              onMouseMove={() => setSel(i)}
              onClick={() => open(n)}
            >
              <span className={styles.resultTitle}>{n.title || firstLine(n.body)}</span>
              <span className={styles.resultSub}>
                {when(n.updatedAt)} · {firstLine(n.body)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
