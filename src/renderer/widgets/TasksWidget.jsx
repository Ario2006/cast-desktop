import { useCallback, useEffect, useState } from 'react'
import { parseTask } from '@shared/commands'
import { formatWhen } from '@shared/timeparse'
import { api } from '../api'
import { useFooterHints } from '../hooks/useWidget'
import { useStore } from '../store/useStore'
import styles from './widgets.module.css'

export default function TasksWidget() {
  const [tasks, setTasks] = useState(null)
  const [draft, setDraft] = useState('')
  const [sel, setSel] = useState(-1)
  const [error, setError] = useState(null)

  const load = useCallback(
    () =>
      api.tasks
        .list()
        .then(setTasks)
        .catch((e) => setError(e.message)),
    []
  )
  useEffect(() => {
    load()
  }, [load])

  const add = async () => {
    const parsed = parseTask(`todo ${draft}`)
    if (!parsed) return
    try {
      await api.tasks.add(parsed.text, parsed.due)
      setDraft('')
      load()
    } catch (e) {
      setError(e.message)
    }
  }
  const toggle = async (t) => {
    await api.tasks.update({ id: t.id, done: !t.done }).catch((e) => setError(e.message))
    load()
  }
  const remove = async (t) => {
    await api.tasks.delete(t.id)
    load()
    // undo recreates the task (with its due date)
    useStore.getState().showToast('Task deleted', 'info', 6000, {
      label: 'Undo',
      run: async () => {
        await api.tasks.add(
          t.text,
          t.due && t.due > Date.now() ? new Date(t.due).toISOString() : undefined
        )
        load()
      }
    })
  }

  useFooterHints([
    ['↵', 'Add'],
    ['↑↓', 'Select'],
    ['Space', 'Done'],
    ['⌘⌫', 'Delete']
  ])
  const list = tasks ?? []
  const onKey = (e) => {
    if (e.key === 'Enter' && draft.trim()) return (e.preventDefault(), add())
    if (e.key === 'ArrowDown')
      return (e.preventDefault(), setSel((s) => Math.min(list.length - 1, s + 1)))
    if (e.key === 'ArrowUp') return (e.preventDefault(), setSel((s) => Math.max(-1, s - 1)))
    if (sel >= 0 && !draft && (e.key === ' ' || e.key === 'Enter'))
      return (e.preventDefault(), toggle(list[sel]))
    if (sel >= 0 && e.metaKey && e.key === 'Backspace')
      return (e.preventDefault(), remove(list[sel]))
  }
  const preview = draft.trim() ? parseTask(`todo ${draft}`) : null
  const open = list.filter((t) => !t.done).length

  return (
    <div className={styles.widget}>
      <input
        className={styles.text}
        autoFocus
        value={draft}
        placeholder="Add a task — e.g. “call the bank friday 5pm”"
        aria-label="New task"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
      />
      {preview?.due && (
        <div className={styles.status}>Due {formatWhen(preview.due)} · you’ll get a reminder</div>
      )}
      {tasks && list.length === 0 ? (
        <div className={styles.empty}>No tasks yet. Type one above and press ↵.</div>
      ) : (
        <ul className={styles.list} aria-label="Tasks">
          {list.map((t, i) => {
            const overdue = !t.done && t.due && t.due < Date.now()
            return (
              <li
                key={t.id}
                className={`${styles.item} ${t.done ? styles.itemDone : ''}`}
                aria-selected={i === sel}
                onMouseMove={() => setSel(i)}
              >
                <button
                  className={styles.checkbox}
                  role="checkbox"
                  aria-checked={t.done}
                  aria-label={`Mark “${t.text}” ${t.done ? 'not done' : 'done'}`}
                  onClick={() => toggle(t)}
                >
                  {t.done ? '✓' : ''}
                </button>
                <span className={styles.itemMain}>
                  <span className={styles.itemTitle}>{t.text}</span>
                  {t.due && (
                    <span className={`${styles.itemSub} ${overdue ? styles.overdue : ''}`}>
                      {overdue ? 'Overdue · ' : ''}
                      {formatWhen(t.due)}
                    </span>
                  )}
                </span>
                <button
                  className={styles.iconBtn}
                  aria-label={`Delete “${t.text}”`}
                  onClick={() => remove(t)}
                >
                  ✕
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <div className={styles.inline}>
        <span className={styles.status}>{open} open</span>
        <span className={styles.spacer} />
        {list.some((t) => t.done) && (
          <button className={styles.linkBtn} onClick={() => api.tasks.clearDone().then(load)}>
            Clear completed
          </button>
        )}
      </div>
      {error && <div className={styles.err}>{error}</div>}
    </div>
  )
}
