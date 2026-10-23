import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { useFooterHints } from '../hooks/useWidget'
import { useStore } from '../store/useStore'
import styles from './widgets.module.css'

const COLS = 10
const RECENT_KEY = 'cast.recentEmoji'
const readRecent = () => {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
  } catch {
    return []
  }
}

/** Searchable emoji grid (data loaded on demand so it isn't in the launcher's startup bundle). */
export default function EmojiWidget({ params }) {
  const [query, setQuery] = useState(params.query ?? '')
  const [data, setData] = useState(null)
  const [sel, setSel] = useState(0)

  useEffect(() => {
    Promise.all([import('unicode-emoji-json/data-by-emoji.json'), import('emojilib')]).then(
      ([names, keywords]) => {
        const n = names.default ?? names
        const k = keywords.default ?? keywords
        setData(
          Object.entries(n).map(([char, info]) => ({
            char,
            name: info.name,
            group: info.group,
            words: [info.name, ...(k[char] ?? [])].join(' ').toLowerCase()
          }))
        )
      }
    )
  }, [])

  const results = useMemo(() => {
    if (!data) return []
    const q = query.trim().toLowerCase().replace(/^:/, '')
    if (!q) {
      const recent = readRecent()
      const recentItems = recent.map((c) => data.find((d) => d.char === c)).filter(Boolean)
      return [...recentItems, ...data.filter((d) => !recent.includes(d.char))].slice(0, 200)
    }
    const terms = q.split(/\s+/)
    return data
      .filter((d) => terms.every((t) => d.words.includes(t)))
      .map((d) => ({
        d,
        score: d.name.startsWith(q)
          ? 0
          : d.name.split(' ').some((w) => w.startsWith(terms[0]))
            ? 1
            : 2
      }))
      .sort((a, b) => a.score - b.score)
      .slice(0, 200)
      .map((x) => x.d)
  }, [data, query])

  useEffect(() => setSel(0), [query])
  const pick = async (e) => {
    if (!e) return
    try {
      localStorage.setItem(
        RECENT_KEY,
        JSON.stringify([e.char, ...readRecent().filter((c) => c !== e.char)].slice(0, 20))
      )
    } catch {
      /* storage unavailable */
    }
    await api.app.copy(e.char)
    useStore.getState().showToast(`Copied ${e.char}`, 'success', 900)
    setTimeout(() => useStore.getState().hide(), 450)
  }
  useFooterHints([
    ['←↑↓→', 'Move'],
    ['↵', 'Copy']
  ])

  const onKey = (e) => {
    const move = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLS, ArrowUp: -COLS }[e.key]
    if (move) {
      e.preventDefault()
      setSel((s) => Math.max(0, Math.min(results.length - 1, s + move)))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      pick(results[sel])
    }
  }

  return (
    <div className={styles.widget}>
      <input
        className={styles.text}
        autoFocus
        value={query}
        placeholder="Search emoji — e.g. heart, party, thumbs"
        aria-label="Search emoji"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKey}
      />
      {!data ? (
        <div className={styles.empty}>Loading…</div>
      ) : results.length === 0 ? (
        <div className={styles.empty}>No emoji match “{query}”.</div>
      ) : (
        <div className={styles.emojiGrid} role="listbox" aria-label="Emoji">
          {results.map((e, i) => (
            <button
              key={e.char}
              role="option"
              aria-selected={i === sel}
              aria-label={e.name}
              title={e.name}
              className={styles.emoji}
              onMouseMove={() => setSel(i)}
              onClick={() => pick(e)}
            >
              {e.char}
            </button>
          ))}
        </div>
      )}
      <div className={styles.status}>{results[sel] ? results[sel].name : ''}</div>
    </div>
  )
}
