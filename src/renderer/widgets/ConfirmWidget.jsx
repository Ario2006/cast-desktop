import { useRef } from 'react'
import { useFooterHints, useWidgetKeys } from '../hooks/useWidget'
import { runInstant } from '../store/run'
import { useStore } from '../store/useStore'
import styles from './widgets.module.css'

/** Asks before a destructive action (restart, empty trash, kill a port…), then re-runs it confirmed. */
export default function ConfirmWidget({ params }) {
  const busy = useRef(false)
  const confirm = () => {
    if (busy.current) return
    busy.current = true
    runInstant(params.retry.actionId, params.retry.params)
  }
  useWidgetKeys((e) => {
    if (e.key === 'Enter' && !e.metaKey) return (confirm(), true)
    return false
  })
  useFooterHints([['↵', 'Confirm']])
  return (
    <div className={styles.widget} role="alertdialog" aria-label="Confirm">
      <div className={styles.big}>Are you sure?</div>
      <div className={styles.note}>{params.message}</div>
      <div className={styles.controls} style={{ justifyContent: 'flex-end' }}>
        <button className={styles.btn} onClick={() => useStore.getState().closeWidget()}>
          Cancel
        </button>
        <button className={`${styles.btn} ${styles.primary}`} autoFocus onClick={confirm}>
          Confirm <kbd>↵</kbd>
        </button>
      </div>
    </div>
  )
}
