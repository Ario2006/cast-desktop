import { useRef, useState } from 'react'
import { api } from '../api'
import { useFooterHints, useWidgetKeys } from '../hooks/useWidget'
import { useStore } from '../store/useStore'
import styles from './widgets.module.css'

/** Runs one step of a chained command directly (each step was fully parsed already). */
async function runStep({ actionId, params: p }) {
  switch (actionId) {
    case 'reminder.create':
      if (!p.text || !p.remindAt) throw new Error('Needs both what and when')
      return api.reminders.create({ text: p.text, remindAt: p.remindAt, repeat: p.repeat })
    case 'timer.start':
      if (!p.durationSeconds) throw new Error('Needs a duration')
      return api.timers.start({ kind: 'timer', durationSeconds: p.durationSeconds, label: p.label })
    case 'note.create':
      return api.notes.create({ body: p.body })
    case 'task.add':
      return api.tasks.add(p.text, p.due)
    case 'calendar.create':
      if (!p.start || !p.title) throw new Error('Needs a title and a time')
      return api.calendar.create({
        title: p.title,
        start: p.start,
        end: p.end,
        recurrence: p.recurrence
      })
    default:
      throw new Error('Can’t run this step')
  }
}

const MESSAGES = {
  RECONNECT: 'Connect Google Calendar first',
  NOT_CONFIGURED: 'Set up Google Calendar first'
}

export default function ChainWidget({ params }) {
  const [states, setStates] = useState(params.steps.map(() => ({ status: 'pending' })))
  const ran = useRef(false)
  const runAll = async () => {
    if (ran.current) return
    ran.current = true
    const out = []
    for (const [i, step] of params.steps.entries()) {
      setStates((s) => s.map((x, j) => (j === i ? { status: 'running' } : x)))
      try {
        await runStep(step)
        out[i] = { status: 'done' }
      } catch (e) {
        out[i] = { status: 'error', message: MESSAGES[e.code] ?? e.message }
      }
      setStates((s) => s.map((x, j) => (j === i ? out[i] : x)))
    }
    const ok = out.filter((x) => x.status === 'done').length
    if (ok === params.steps.length) {
      useStore.getState().showToast(`Done — ${ok} things set up`, 'success', 1400)
      setTimeout(() => useStore.getState().hide(), 900)
    }
  }
  useWidgetKeys((e) => (e.key === 'Enter' && !e.metaKey ? (runAll(), true) : false))
  useFooterHints([['↵', 'Do all']])
  const icon = { pending: '○', running: '…', done: '✓', error: '!' }
  return (
    <div className={styles.widget}>
      <div className={styles.big}>Do {params.steps.length} things</div>
      <ul className={styles.list}>
        {params.steps.map((step, i) => (
          <li key={i} className={styles.item}>
            <span
              className={`${styles.stepState} ${states[i].status === 'done' ? styles.ok : states[i].status === 'error' ? styles.err : ''}`}
            >
              {icon[states[i].status]}
            </span>
            <span className={styles.itemMain}>
              <span className={styles.itemTitle}>{step.title}</span>
              <span
                className={`${styles.itemSub} ${states[i].status === 'error' ? styles.overdue : ''}`}
              >
                {states[i].message ?? step.subtitle}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <div className={styles.controls} style={{ justifyContent: 'flex-end' }}>
        <button
          className={`${styles.btn} ${styles.primary}`}
          onClick={runAll}
          disabled={ran.current}
        >
          Do all <kbd>↵</kbd>
        </button>
      </div>
    </div>
  )
}
