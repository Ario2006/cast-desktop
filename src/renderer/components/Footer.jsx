import { useStore } from '../store/useStore'
import styles from './launcher.module.css'

const AI_NOTICE = {
  offline: 'Smart suggestions offline',
  unauthorized: 'AI key rejected — check Settings',
  rate_limited: 'Smart suggestions paused (rate limit)'
}

export default function Footer() {
  const widget = useStore((s) => s.activeWidget)
  const hint = useStore((s) => s.footerHint)
  const ai = useStore((s) => s.status.ai)
  const recording = useStore((s) => s.status.recording)
  const smart = useStore((s) => s.settings.smartSuggestions)

  const notice = smart ? AI_NOTICE[ai] : null
  return (
    <div className={styles.footer}>
      <div className={styles.hints}>
        {widget ? (
          <>
            <span>
              <kbd>⎋</kbd> Back
            </span>
            {hint}
          </>
        ) : (
          <>
            <span>
              <kbd>↵</kbd> Run
            </span>
            <span>
              <kbd>⇥</kbd> Complete
            </span>
            <span>
              <kbd>⌘,</kbd> Settings
            </span>
            <span>
              <kbd>⎋</kbd> Close
            </span>
          </>
        )}
      </div>
      {recording ? (
        <span className={styles.notice}>● Recording</span>
      ) : (
        notice && <span className={styles.notice}>{notice}</span>
      )}
    </div>
  )
}
