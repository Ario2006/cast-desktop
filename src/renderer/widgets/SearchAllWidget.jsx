import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { useFooterHints } from '../hooks/useWidget'
import { useStore } from '../store/useStore'
import styles from './widgets.module.css'

const first = (t = '') =>
  t
    .split('\n')
    .find((l) => l.trim())
    ?.trim() ?? ''

/** One search across notes, tasks, snippets, clipboard history, quicklinks and files. */
export default function SearchAllWidget({ params }) {
  const [query, setQuery] = useState(params.query ?? '')
  const [res, setRes] = useState(null)
  const [sel, setSel] = useState(0)
  const seq = useRef(0)
  useEffect(() => {
    const mine = ++seq.current
    if (!query.trim()) return setRes(null)
    const t = setTimeout(
      () =>
        api.overview
          .searchAll(query.trim())
          .then((r) => mine === seq.current && (setRes(r), setSel(0)))
          .catch(() => {}),
      140
    )
    return () => clearTimeout(t)
  }, [query])

  const st = () => useStore.getState()
  const items = useMemo(() => {
    if (!res) return []
    return [
      ...res.notes.map((n) => ({
        group: 'Notes',
        title: n.title || first(n.body),
        sub: first(n.body),
        run: () => st().openWidget('note.create', { noteId: n.id })
      })),
      ...res.tasks.map((t) => ({
        group: 'Tasks',
        title: t.text,
        sub: t.done ? 'Done' : 'Open task',
        run: () => st().openWidget('tasks.open', {})
      })),
      ...res.snippets.map((s) => ({
        group: 'Snippets',
        title: s.name,
        sub: first(s.body),
        run: () => api.snippets.copy(s.id)
      })),
      ...res.clipboard.map((c) => ({
        group: 'Clipboard',
        title: first(c.text),
        sub: 'Copied earlier',
        run: () => api.clipboard.copy(c.id)
      })),
      ...res.quicklinks.map((q) => ({
        group: 'Quicklinks',
        title: q.name,
        sub: q.keyword,
        run: () =>
          api.actions.run('quicklink.open', {
            id: q.id,
            name: q.name,
            url: q.url.replace(/\{query\}/g, '')
          })
      })),
      ...res.files.map((f) => ({
        group: 'Files',
        title: f.name,
        sub: f.path,
        run: () => api.actions.run('file.open', { path: f.path })
      }))
    ]
  }, [res])
  useFooterHints([
    ['↑↓', 'Navigate'],
    ['↵', 'Open']
  ])
  const onKey = (e) => {
    if (e.key === 'ArrowDown')
      return (e.preventDefault(), setSel((s) => Math.min(items.length - 1, s + 1)))
    if (e.key === 'ArrowUp') return (e.preventDefault(), setSel((s) => Math.max(0, s - 1)))
    if (e.key === 'Enter' && items[sel]) return (e.preventDefault(), items[sel].run())
  }
  let lastGroup = null
  return (
    <div className={styles.widget}>
      <input
        className={styles.text}
        autoFocus
        value={query}
        placeholder="Search notes, tasks, snippets, clipboard, files…"
        aria-label="Search everything"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKey}
      />
      {res && items.length === 0 && (
        <div className={styles.empty}>Nothing found for “{query}”.</div>
      )}
      <ul className={styles.list} style={{ maxHeight: 300 }} role="listbox">
        {items.map((it, i) => {
          const header = it.group !== lastGroup ? it.group : null
          lastGroup = it.group
          return (
            <div key={i} style={{ display: 'contents' }}>
              {header && <li className={styles.groupLabel}>{header}</li>}
              <li
                role="option"
                aria-selected={i === sel}
                className={styles.item}
                onMouseMove={() => setSel(i)}
                onClick={() => it.run()}
              >
                <span className={styles.itemMain}>
                  <span className={styles.itemTitle}>{it.title}</span>
                  <span className={styles.itemSub}>{it.sub}</span>
                </span>
              </li>
            </div>
          )
        })}
      </ul>
    </div>
  )
}
