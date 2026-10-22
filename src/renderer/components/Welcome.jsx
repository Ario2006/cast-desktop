import { useEffect, useState } from 'react'
import { prettyAccelerator } from './SettingsControls'
import { api } from '../api'
import { useStore } from '../store/useStore'
import styles from './welcome.module.css'

function Step({ title, desc, done, action }) {
  return (
    <div className={styles.step}>
      <span className={styles.mark} data-done={done}>
        {done ? '✓' : ''}
      </span>
      <div className={styles.text}>
        <div className={styles.title}>{title}</div>
        <div className={styles.desc}>{desc}</div>
      </div>
      {action}
    </div>
  )
}

/** First-run walkthrough: shortcut, permissions, AI key and Google, each skippable. */
export default function Welcome() {
  const shortcut = useStore((s) => s.settings.shortcut)
  const [perm, setPerm] = useState({})
  const [secrets, setSecrets] = useState({})

  useEffect(() => {
    let alive = true
    const poll = () => {
      api.permissions
        .status()
        .then((p) => alive && setPerm(p))
        .catch(() => {})
      api.settings
        .secretsStatus()
        .then((s) => alive && setSecrets(s))
        .catch(() => {})
    }
    poll()
    const id = setInterval(poll, 1500)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  const go = (section) => useStore.getState().openSettings(section)
  const finish = async () => {
    await useStore.getState().setSetting('onboarded', true)
    useStore.setState({ view: 'launcher' })
  }

  return (
    <div className={styles.root}>
      <h2 className={styles.heading}>Welcome to Cast</h2>
      <p className={styles.sub}>
        A few optional steps to get the most out of it. You can change any of this later in
        Settings.
      </p>
      <div className={styles.steps}>
        <Step
          done
          title={`Press ${prettyAccelerator(shortcut)} anywhere`}
          desc="Opens Cast over whatever you're doing. Esc hides it."
          action={
            <button className={styles.btn} onClick={() => go('general')}>
              Change
            </button>
          }
        />
        <Step
          done={perm.screen === 'granted'}
          title="Screen Recording"
          desc="Needed for screenshots and screen recordings."
          action={
            <button className={styles.btn} onClick={() => api.permissions.open('screen')}>
              Allow
            </button>
          }
        />
        <Step
          done={Boolean(secrets.aiApiKey)}
          title="Smart suggestions"
          desc="Add your Openjev API key so Cast can pick the right tool as you type."
          action={
            <button className={styles.btn} onClick={() => go('suggestions')}>
              Add key
            </button>
          }
        />
        <Step
          done={Boolean(secrets.googleConnected)}
          title="Google Calendar"
          desc="Book events and see your agenda."
          action={
            <button className={styles.btn} onClick={() => go('calendar')}>
              Connect
            </button>
          }
        />
      </div>
      <div className={styles.footer}>
        <span className={styles.hint}>
          Try typing <b>25m</b> or <b>remind me to call mom tomorrow at 5pm</b>
        </span>
        <button className={styles.primary} onClick={finish}>
          Get started
        </button>
      </div>
    </div>
  )
}
