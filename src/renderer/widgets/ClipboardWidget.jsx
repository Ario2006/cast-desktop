import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { useFooterHints } from '../hooks/useWidget'
import { useStore } from '../store/useStore'
import styles from './widgets.module.css'

const ago = (ms) => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  return `${Math.floor(s / 3600)} h ago`
}

export default function ClipboardWidget({ params }) {
  const [query, setQuery] = useState(params.query ?? '')
  const [data, setData] = useState(null) // { enabled, items }
  const [sel, setSel] = useState(0)
  const [error, setError] = useState(null)

  const load = useCallback(
    () =>
      api.clipboard
        .list(query)
        .then((d) => {
          setData(d)
          setSel(0)
        })
        .catch((e) => setError(e.message)),
    [query]
  )
  useEffect(() => {
    load()
  }, [load])

  const copy = (item) => item && api.clipboard.copy(item.id).catch((e) => setError(e.message))

  useFooterHints(
    data?.enabled
      ? [
          ['↑↓', 'Navigate'],
          ['↵', 'Copy']
        ]
      : []
  )

  if (data && !data.enabled) {
    return (
      <div className={styles.widget}>
        <div className={styles.big}>Clipboard history is off</div>
        <div className={styles.note}>
          Turn it on to keep your last 50 copied snippets of text. They stay in memory only (never
          saved to disk), disappear when you quit Cast, and anything a password manager copies is
          skipped.
        </div>
        <div className={styles.controls} style={{ justifyContent: 'flex-start' }}>
          <button
            className={`${styles.btn} ${styles.primary}`}
            onClick={async () => {
              await useStore.getState().setSetting('clipboardHistory', true)
              load()
            }}
          >
            Turn on
          </button>
        </div>
      </div>
    )
  }

  const items = data?.items ?? []
  const onKey = (e) => {
    if (e.key === 'ArrowDown')
      (e.preventDefault(), setSel((s) => Math.min(items.length - 1, s + 1)))
    else if (e.key === 'ArrowUp') (e.preventDefault(), setSel((s) => Math.max(0, s - 1)))
    else if (e.key === 'Enter') (e.preventDefault(), copy(items[sel]))
  }

  return (
    <div className={styles.widget}>
      <input
        className={styles.text}
        autoFocus
        placeholder="Search your clipboard history…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKey}
      />
      {data && items.length === 0 ? (
        <div className={styles.empty}>
          {query ? 'No matches.' : 'Nothing copied yet — copy some text and it will show up here.'}
        </div>
      ) : (
        <ul className={styles.results} role="listbox">
          {items.map((i, n) => (
            <li
              key={i.id}
              role="option"
              aria-selected={n === sel}
              className={styles.result}
              onMouseMove={() => setSel(n)}
              onClick={() => copy(i)}
            >
              <span className={styles.resultTitle}>
                {i.text
                  .split('\n')
                  .find((l) => l.trim())
                  ?.trim() ?? i.text}
              </span>
              <span className={styles.resultSub}>
                {ago(i.at)} · {i.text.length} chars
              </span>
            </li>
          ))}
        </ul>
      )}
      {items.length > 0 && (
        <div className={styles.rowActions}>
          <button
            className={styles.linkBtn}
            onClick={async () => {
              await api.clipboard.clear()
              load()
            }}
          >
            Clear all
          </button>
        </div>
      )}
      {error && <div className={styles.err}>{error}</div>}
    </div>
  )
}
