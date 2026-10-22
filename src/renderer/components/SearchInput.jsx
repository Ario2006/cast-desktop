import { useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'
import Icon from './Icon'
import styles from './launcher.module.css'

const CHIPS = {
  'timer.start': 'Timer',
  'stopwatch.start': 'Stopwatch',
  'calendar.create': 'Calendar',
  'note.create': 'Note',
  'notes.search': 'Notes',
  'reminder.create': 'Reminder'
}

export default function SearchInput() {
  const ref = useRef(null)
  const query = useStore((s) => s.query)
  const setQuery = useStore((s) => s.setQuery)
  const widget = useStore((s) => s.activeWidget)
  const aiPending = useStore((s) => s.aiPending)
  const animToken = useStore((s) => s.animToken)
  const view = useStore((s) => s.view)

  // Focus on first mount, on every show, and when returning from a widget/settings.
  useEffect(() => {
    if (view === 'launcher' && !widget) ref.current?.focus()
  }, [animToken, widget, view])

  return (
    <div className={styles.inputBar}>
      <Icon name="search" size={20} className={styles.searchIcon} />
      {widget && CHIPS[widget.actionId] && (
        <span className={styles.chip}>{CHIPS[widget.actionId]}</span>
      )}
      <input
        ref={ref}
        className={styles.input}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="What do you want to do?"
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        autoFocus
        role="combobox"
        aria-expanded="true"
        aria-controls="cast-results"
        aria-label="Search actions"
      />
      {aiPending && <span className={styles.spinner} title="Thinking…" />}
    </div>
  )
}
