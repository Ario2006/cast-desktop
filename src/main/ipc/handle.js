import { ipcMain } from 'electron'
import { safe } from '../../shared/validate.js'

const err = (code, message, extra) => ({ ok: false, error: { code, message, ...extra } })

/**
 * Validated IPC helpers. Every handler:
 *  - only accepts messages from the launcher window,
 *  - validates the payload shape before touching it,
 *  - returns { ok: true, data } or { ok: false, error: { code, message } }.
 */
export function createIpc({ windows, log }) {
  function handle(channel, schema, fn) {
    ipcMain.handle(channel, async (event, payload) => {
      if (!windows.isFromLauncher(event)) return err('FORBIDDEN', 'Untrusted sender')
      let value
      if (schema) {
        const r = safe(schema, payload)
        if (!r.ok) return err('INVALID', r.error)
        value = r.value
      }
      try {
        return { ok: true, data: await fn(value, event) }
      } catch (e) {
        log?.warn(`ipc ${channel} failed`, { code: e?.code, name: e?.name }) // never log messages: may contain user text
        return err(
          e?.code ?? 'ERROR',
          e?.message ?? 'Something went wrong',
          e?.permission ? { permission: e.permission } : undefined
        )
      }
    })
  }

  /** Fire-and-forget messages (no reply). */
  function on(channel, schema, fn) {
    ipcMain.on(channel, (event, payload) => {
      if (!windows.isFromLauncher(event)) return
      const r = schema ? safe(schema, payload) : { ok: true }
      if (!r.ok) return
      try {
        fn(r.value, event)
      } catch (e) {
        log?.warn(`ipc ${channel} failed`, { code: e?.code })
      }
    })
  }

  return { handle, on }
}
