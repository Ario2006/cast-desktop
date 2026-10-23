import { CHEATSHEET } from '@shared/cheatsheet'
import { useStore } from '../store/useStore'
import styles from './widgets.module.css'

/** "?" — everything you can type. Clicking an example runs it in the main input. */
export default function CheatSheetWidget() {
  return (
    <div className={styles.widget}>
      <div className={styles.cheatGrid}>
        {CHEATSHEET.flatMap(({ group, items }) => [
          <div key={group} className={styles.cheatGroup}>
            {group}
          </div>,
          ...items.map(([q, desc]) => (
            <button
              key={q}
              className={styles.cheatItem}
              onClick={() => useStore.getState().setQuery(q)}
            >
              <span className={styles.cheatQuery}>{q}</span>
              <span className={styles.cheatDesc}>{desc}</span>
            </button>
          ))
        ])}
      </div>
    </div>
  )
}
