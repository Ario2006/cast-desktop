import { api } from '../api'
import Icon from './Icon'
import styles from './launcher.module.css'

const COPY = {
  screen: {
    title: 'Screen Recording permission required',
    body: 'Allow Cast under Privacy & Security → Screen Recording, then try again.'
  },
  microphone: {
    title: 'Microphone permission required',
    body: 'Allow Cast under Privacy & Security → Microphone, then try again.'
  }
}

export default function PermissionCard({ permission, message }) {
  const copy = COPY[permission] ?? { title: message, body: '' }
  return (
    <div className={styles.card} role="alert">
      <Icon name="warning" size={22} className={styles.cardIcon} />
      <div>
        <h3>{copy.title}</h3>
        <p>{copy.body}</p>
        <button className={styles.btn} onClick={() => api.permissions.open(permission)}>
          Open System Settings
        </button>
      </div>
    </div>
  )
}
