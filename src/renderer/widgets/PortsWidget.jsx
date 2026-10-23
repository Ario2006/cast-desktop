import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { useFooterHints } from '../hooks/useWidget'
import { runInstant } from '../store/run'
import styles from './widgets.module.css'

export default function PortsWidget({ params }) {
  const [ports, setPorts] = useState(null)
  const [sel, setSel] = useState(0)
  const [filter, setFilter] = useState(params.port ? String(params.port) : '')
  const load = useCallback(
    () =>
      api.dev
        .ports()
        .then((p) => setPorts(p))
        .catch(() => setPorts([])),
    []
  )
  useEffect(() => {
    load()
  }, [load])
  const list = (ports ?? []).filter(
    (p) =>
      !filter ||
      String(p.port).startsWith(filter) ||
      p.command.toLowerCase().includes(filter.toLowerCase())
  )
  const current = list[sel]
  useFooterHints([
    ['↵', 'Open in browser'],
    ['⌘⌫', 'Stop process']
  ])
  const onKey = (e) => {
    if (e.key === 'ArrowDown')
      return (e.preventDefault(), setSel((s) => Math.min(list.length - 1, s + 1)))
    if (e.key === 'ArrowUp') return (e.preventDefault(), setSel((s) => Math.max(0, s - 1)))
    if (e.key === 'Enter' && current)
      return (
        e.preventDefault(),
        api.actions.run('web.openUrl', { url: `http://localhost:${current.port}` })
      )
    if (e.metaKey && e.key === 'Backspace' && current)
      return (e.preventDefault(), runInstant('port.kill', { port: current.port }))
  }
  return (
    <div className={styles.widget}>
      <div className={styles.inline}>
        <input
          className={styles.text}
          autoFocus
          value={filter}
          placeholder="Filter by port or process"
          aria-label="Filter ports"
          onChange={(e) => (setFilter(e.target.value), setSel(0))}
          onKeyDown={onKey}
        />
        <button className={styles.btn} onClick={load}>
          Refresh
        </button>
      </div>
      {ports && list.length === 0 ? (
        <div className={styles.empty}>
          {filter ? 'Nothing matches.' : 'No servers are listening right now.'}
        </div>
      ) : (
        <ul className={styles.list} aria-label="Listening ports">
          {list.map((p, i) => (
            <li
              key={`${p.pid}:${p.port}`}
              className={styles.item}
              aria-selected={i === sel}
              onMouseMove={() => setSel(i)}
            >
              <span className={styles.mono} style={{ width: 54, fontWeight: 600 }}>
                :{p.port}
              </span>
              <span className={styles.itemMain}>
                <span className={styles.itemTitle}>{p.command}</span>
                <span className={styles.itemSub}>
                  PID {p.pid} · {p.address}
                </span>
              </span>
              <button
                className={styles.linkBtn}
                onClick={() =>
                  api.actions.run('web.openUrl', { url: `http://localhost:${p.port}` })
                }
              >
                Open
              </button>
              <button
                className={`${styles.linkBtn} ${styles.danger}`}
                onClick={() => runInstant('port.kill', { port: p.port })}
              >
                Stop
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
