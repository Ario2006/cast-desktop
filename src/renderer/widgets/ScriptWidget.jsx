import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { useFooterHints } from '../hooks/useWidget'
import { useStore } from '../store/useStore'
import Icon from '../components/Icon'
import styles from './widgets.module.css'

/** Runs one of your script commands and shows its output (with an argument prompt if it takes one). */
export default function ScriptWidget({ params }) {
  const [argument, setArgument] = useState(params.argument ?? '')
  const [state, setState] = useState(params.takesArgument && !params.argument ? 'input' : 'running')
  const [result, setResult] = useState(null)
  const started = useRef(false)

  const run = async () => {
    setState('running')
    try {
      const r = await api.dev.runScript(params.id, argument || undefined)
      setResult(r)
      setState('done')
      if (r.mode === 'copy') useStore.getState().showToast('Output copied', 'success', 1400)
    } catch (e) {
      setResult({ error: e.message })
      setState('error')
    }
  }
  useEffect(() => {
    if (state === 'running' && !started.current) {
      started.current = true
      run()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useFooterHints(state === 'input' ? [['↵', 'Run']] : [['⌘C', 'Copy output']])

  return (
    <div
      className={styles.widget}
      onKeyDown={(e) => {
        if (
          e.metaKey &&
          e.key.toLowerCase() === 'c' &&
          result?.output &&
          !window.getSelection()?.toString()
        ) {
          e.preventDefault()
          api.app
            .copy(result.output)
            .then(() => useStore.getState().showToast('Copied', 'success', 900))
        }
      }}
    >
      <div className={styles.big}>{params.title ?? params.id}</div>
      {state === 'input' && (
        <div className={styles.inline}>
          <input
            className={styles.text}
            autoFocus
            value={argument}
            placeholder="Argument"
            aria-label="Script argument"
            onChange={(e) => setArgument(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), run())}
          />
          <button className={`${styles.btn} ${styles.primary}`} onClick={run}>
            Run
          </button>
        </div>
      )}
      {state === 'running' && <div className={styles.sub}>Running…</div>}
      {state === 'error' && <div className={styles.err}>{result.error}</div>}
      {state === 'done' &&
        (result.mode === 'silent' || !result.output ? (
          <div className={styles.ok}>
            <Icon name="check" size={14} strokeWidth={2.6} /> Done
          </div>
        ) : (
          <>
            <pre className={styles.pre} tabIndex={0}>
              {result.output}
            </pre>
            <div className={styles.controls} style={{ justifyContent: 'flex-end' }}>
              <button className={styles.btn} onClick={run}>
                Run again
              </button>
              <button
                className={`${styles.btn} ${styles.primary}`}
                onClick={() =>
                  api.app
                    .copy(result.output)
                    .then(() => useStore.getState().showToast('Copied', 'success', 900))
                }
              >
                Copy output
              </button>
            </div>
          </>
        ))}
    </div>
  )
}
