import { Notification } from 'electron'

const live = new Set() // keep references so notifications are not garbage-collected before they fire

/**
 * Native macOS notification.
 * opts: { title, body, sound?, silent?, actions?: [{ text, onAction }], onClick? }
 */
export function showNotification({ title, body, sound, silent = false, actions = [], onClick }) {
  if (!Notification.isSupported()) return null
  const n = new Notification({
    title,
    body,
    silent: silent || sound === 'none',
    sound: sound && sound !== 'none' ? sound : undefined,
    actions: actions.map((a) => ({ type: 'button', text: a.text })),
    closeButtonText: actions.length ? 'Dismiss' : undefined
  })
  live.add(n)
  const release = () => live.delete(n)
  n.on('click', () => {
    onClick?.()
    release()
  })
  n.on('action', (_e, index) => {
    actions[index]?.onAction?.()
    release()
  })
  n.on('close', release)
  n.on('failed', release)
  n.show()
  // macOS may never emit close for ignored banners; don't hold the reference forever
  setTimeout(release, 5 * 60_000).unref?.()
  return n
}
