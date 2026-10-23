import { useMemo, useState } from 'react'
import { diffWordsWithSpace } from 'diff'
import { applyTransform } from '@shared/devtools'
import { api } from '../api'
import { useFooterHints } from '../hooks/useWidget'
import { useStore } from '../store/useStore'
import styles from './widgets.module.css'

function JsonTool() {
  const [text, setText] = useState('')
  const out = useMemo(() => {
    if (!text.trim()) return null
    try {
      return { ok: applyTransform('json', text) }
    } catch (e) {
      return { error: e.message }
    }
  }, [text])
  return (
    <>
      <textarea
        className={styles.area}
        style={{ minHeight: 90 }}
        autoFocus
        value={text}
        placeholder="Paste JSON…"
        aria-label="JSON input"
        onChange={(e) => setText(e.target.value)}
      />
      {out?.error && <div className={styles.err}>{out.error}</div>}
      {out?.ok && (
        <>
          <pre className={styles.pre}>{out.ok}</pre>
          <div className={styles.controls} style={{ justifyContent: 'flex-end' }}>
            <button
              className={styles.btn}
              onClick={() =>
                api.app
                  .copy(applyTransform('jsonmin', text))
                  .then(() =>
                    useStore.getState().showToast('Copied minified JSON', 'success', 1200)
                  )
              }
            >
              Copy minified
            </button>
            <button
              className={`${styles.btn} ${styles.primary}`}
              onClick={() =>
                api.app
                  .copy(out.ok)
                  .then(() =>
                    useStore.getState().showToast('Copied formatted JSON', 'success', 1200)
                  )
              }
            >
              Copy formatted
            </button>
          </div>
        </>
      )}
    </>
  )
}

function RegexTool() {
  const [pattern, setPattern] = useState('')
  const [flags, setFlags] = useState('g')
  const [sample, setSample] = useState('')
  const result = useMemo(() => {
    if (!pattern) return null
    let re
    try {
      re = new RegExp(pattern, flags.includes('g') ? flags : `${flags}g`)
    } catch (e) {
      return { error: e.message }
    }
    const parts = []
    let last = 0
    let count = 0
    const groups = []
    for (const m of sample.matchAll(re)) {
      if (m[0] === '' && m.index === last && count > 1000) break
      parts.push(sample.slice(last, m.index), { match: m[0] })
      last = m.index + m[0].length
      if (groups.length < 5 && m.length > 1) groups.push(m.slice(1))
      if (++count > 1000) break
    }
    parts.push(sample.slice(last))
    return { parts, count, groups }
  }, [pattern, flags, sample])
  return (
    <>
      <div className={styles.inline}>
        <input
          className={`${styles.text} ${styles.mono}`}
          autoFocus
          value={pattern}
          placeholder="Pattern, e.g. (\d+)-(\w+)"
          aria-label="Regex pattern"
          onChange={(e) => setPattern(e.target.value)}
        />
        <input
          className={`${styles.text} ${styles.mono}`}
          style={{ width: 70 }}
          value={flags}
          aria-label="Flags"
          onChange={(e) => setFlags(e.target.value.replace(/[^gimsuy]/g, ''))}
        />
      </div>
      <textarea
        className={styles.area}
        style={{ minHeight: 70 }}
        value={sample}
        placeholder="Test text…"
        aria-label="Test text"
        onChange={(e) => setSample(e.target.value)}
      />
      {result?.error && <div className={styles.err}>{result.error}</div>}
      {result?.parts && (
        <>
          <div className={styles.status}>
            {result.count} match{result.count === 1 ? '' : 'es'}
            {result.groups.length > 0 &&
              ` · groups: ${result.groups.map((g) => `[${g.join(', ')}]`).join(' ')}`}
          </div>
          <pre className={styles.pre}>
            {result.parts.map((p, i) =>
              typeof p === 'string' ? (
                p
              ) : (
                <mark key={i} className={styles.match}>
                  {p.match || '∅'}
                </mark>
              )
            )}
          </pre>
        </>
      )}
    </>
  )
}

function DiffTool() {
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const parts = useMemo(() => (a || b ? diffWordsWithSpace(a, b) : []), [a, b])
  const changes = parts.filter((p) => p.added || p.removed).length
  return (
    <>
      <div className={styles.grid2}>
        <textarea
          className={styles.area}
          style={{ minHeight: 80 }}
          autoFocus
          value={a}
          placeholder="Original"
          aria-label="Original text"
          onChange={(e) => setA(e.target.value)}
        />
        <textarea
          className={styles.area}
          style={{ minHeight: 80 }}
          value={b}
          placeholder="Changed"
          aria-label="Changed text"
          onChange={(e) => setB(e.target.value)}
        />
      </div>
      {parts.length > 0 && (
        <>
          <div className={styles.status}>
            {changes === 0 ? 'Identical' : `${changes} change${changes === 1 ? '' : 's'}`}
          </div>
          <pre className={styles.pre}>
            {parts.map((p, i) => (
              <span
                key={i}
                className={p.added ? styles.diffAdd : p.removed ? styles.diffDel : undefined}
              >
                {p.value}
              </span>
            ))}
          </pre>
        </>
      )}
    </>
  )
}

export default function ScratchpadWidget({ params }) {
  const [mode, setMode] = useState(params.mode ?? 'json')
  useFooterHints([])
  return (
    <div className={styles.widget}>
      <div className={styles.tabs} role="tablist" style={{ alignSelf: 'flex-start' }}>
        {[
          ['json', 'JSON'],
          ['regex', 'Regex'],
          ['diff', 'Diff']
        ].map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-pressed={mode === id}
            aria-selected={mode === id}
            onClick={() => setMode(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === 'json' ? (
        <JsonTool key="j" />
      ) : mode === 'regex' ? (
        <RegexTool key="r" />
      ) : (
        <DiffTool key="d" />
      )}
    </div>
  )
}
