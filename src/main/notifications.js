import { execFile } from 'node:child_process'
import fs from 'node:fs'
import { Notification } from 'electron'

const live = new Set() // keep references so notifications are not garbage-collected before they fire

/**
 * Play a macOS system alert ("Glass", "Ping"…) through `afplay`. Done explicitly rather than via the
 * Notification `sound` option so timers and reminders are audible even when banners are off or
 * the user has Focus / Do Not Disturb filtering notification sounds.
 */
export function playSound(name) {
  if (!name || name === 'none' || !/^[A-Za-z]+$/.test(name)) return
  const file = `/System/Library/Sounds/${name}.aiff`
  if (!fs.existsSync(file)) return
  execFile('afplay', [file], () => {}) // fire and forget; argv array, no shell
}

/**
 * Native macOS notification.
 * (A requested `sound` is played via playSound(), so the banner itself is always silent.)
 * opts: { title, body, sound?, silent?, actions?: [{ text, onAction }], onClick? }
 */
export function showNotification({ title, body, sound, silent = false, actions = [], onClick }) {
  if (!Notification.isSupported()) return null
  const n = new Notification({
    title,
    body,
    silent: true,
    actions: actions.map((a) => ({ type: 'button', text: a.text })),
    closeButtonText: actions.length ? 'Dismiss' : undefined
  })
  live.add(n)
  if (!silent) playSound(sound)
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
