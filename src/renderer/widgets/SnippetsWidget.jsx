import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { useFooterHints } from '../hooks/useWidget'
import styles from './widgets.module.css'

const preview = (t) => t.replace(/\s+/g, ' ').slice(0, 90)

export default function SnippetsWidget({ params }) {
  const [mode, setMode] = useState(params.create ? 'form' : 'list') // list | form
  const [query, setQuery] = useState(params.query ?? '')
  const [items, setItems] = useState(null)
  const [sel, setSel] = useState(0)
  const [editing, setEditing] = useState(null) // snippet being edited, or null for new
  const [name, setName] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState(null)
  const bodyRef = useRef(null)

  const load = useCallback(
    () =>
      api.snippets
        .list(query)
        .then((l) => {
          setItems(l)
          setSel(0)
        })
        .catch((e) => setError(e.message)),
    [query]
  )
  useEffect(() => {
    if (mode === 'list') load()
  }, [load, mode])

  const openForm = (snip = null) => {
    setEditing(snip)
    setName(snip?.name ?? '')
    setBody(snip?.body ?? '')
    setError(null)
    setMode('form')
  }

  const save = async () => {
    setError(null)
    if (!name.trim() || !body.trim()) return setError('Give the snippet a name and some text.')
    try {
      if (editing) await api.snippets.update({ id: editing.id, name, body })
      else await api.snippets.create({ name, body })
      setMode('list')
    } catch (e) {
      setError(e.message)
    }
  }

  useFooterHints(
    mode === 'form'
      ? [['⌘↵', 'Save']]
      : [
          ['↵', 'Copy'],
          ['⌘N', 'New'],
          ['⌘E', 'Edit'],
          ['⌘⌫', 'Delete']
        ]
  )

  const current = items?.[sel]
  const onListKey = (e) => {
    if (e.key === 'ArrowDown')
      (e.preventDefault(), setSel((s) => Math.min((items?.length ?? 1) - 1, s + 1)))
    else if (e.key === 'ArrowUp') (e.preventDefault(), setSel((s) => Math.max(0, s - 1)))
    else if (e.key === 'Enter' && current)
      (e.preventDefault(), api.snippets.copy(current.id).catch((x) => setError(x.message)))
    else if (e.metaKey && e.key.toLowerCase() === 'n') (e.preventDefault(), openForm())
    else if (e.metaKey && e.key.toLowerCase() === 'e' && current)
      (e.preventDefault(), openForm(current))
    else if (e.metaKey && e.key === 'Backspace' && current) {
      e.preventDefault()
      api.snippets.delete(current.id).then(load)
    }
  }

  if (mode === 'form') {
    return (
      <div
        className={styles.widget}
        onKeyDown={(e) => {
          if (e.metaKey && e.key === 'Enter') (e.preventDefault(), save())
        }}
      >
        <label className={styles.field}>
          <span className={styles.label}>Name</span>
          <input
            className={styles.text}
            autoFocus
            value={name}
            maxLength={40}
            placeholder="e.g. email signature"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) =>
              e.key === 'Enter' && !e.metaKey && (e.preventDefault(), bodyRef.current?.focus())
            }
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Text</span>
          <textarea
            ref={bodyRef}
            className={styles.area}
            value={body}
            placeholder="The text to copy…"
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        {error && <div className={styles.err}>{error}</div>}
        <div className={styles.inline}>
          <span className={styles.spacer} />
          <button className={styles.btn} onClick={() => setMode('list')}>
            Cancel
          </button>
          <button className={`${styles.btn} ${styles.primary}`} onClick={save}>
            Save <kbd>⌘↵</kbd>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.widget}>
      <div className={styles.inline}>
        <input
          className={styles.text}
          autoFocus
          placeholder="Search snippets…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onListKey}
        />
        <button className={styles.btn} onClick={() => openForm()}>
          New
        </button>
      </div>
      {items && items.length === 0 ? (
        <div className={styles.empty}>
          {query ? 'No snippets match.' : 'No snippets yet. Create one with “New”.'}
        </div>
      ) : (
        <ul className={styles.results} role="listbox">
          {(items ?? []).map((s, i) => (
            <li
              key={s.id}
              role="option"
              aria-selected={i === sel}
              className={styles.result}
              onMouseMove={() => setSel(i)}
              onClick={() => api.snippets.copy(s.id).catch((x) => setError(x.message))}
            >
              <span className={styles.resultTitle}>{s.name}</span>
              <span className={styles.resultSub}>{preview(s.body)}</span>
            </li>
          ))}
        </ul>
      )}
      {error && <div className={styles.err}>{error}</div>}
    </div>
  )
}
