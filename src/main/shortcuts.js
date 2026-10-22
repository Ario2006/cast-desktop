import { globalShortcut } from 'electron'

/**
 * Global shortcut registration with conflict detection. Registering a new accelerator never
 * drops the old one unless the new one succeeds.
 */
export function createShortcuts({ onToggle, onStopRecording, log }) {
  let current = null
  let stopKey = null

  function tryRegister(accelerator, handler) {
    try {
      return globalShortcut.register(accelerator, handler)
    } catch {
      return false // invalid accelerator string
    }
  }

  return {
    /** @returns {{ ok: boolean, error?: string }} */
    setLauncherShortcut(accelerator) {
      if (accelerator === current && globalShortcut.isRegistered(accelerator)) return { ok: true }
      const previous = current
      if (previous) globalShortcut.unregister(previous)
      if (tryRegister(accelerator, onToggle)) {
        current = accelerator
        return { ok: true }
      }
      if (previous) tryRegister(previous, onToggle) // restore
      log?.warn('shortcut registration failed', { accelerator })
      return {
        ok: false,
        error: `Couldn't register ${accelerator} — it may be taken by another app or macOS (e.g. Spotlight).`
      }
    },

    /** The stop-recording shortcut is only live while a recording is running. */
    setRecordingActive(active, accelerator) {
      if (stopKey) {
        globalShortcut.unregister(stopKey)
        stopKey = null
      }
      if (
        active &&
        accelerator &&
        accelerator !== current &&
        tryRegister(accelerator, onStopRecording)
      )
        stopKey = accelerator
    },

    unregisterAll: () => globalShortcut.unregisterAll()
  }
}
