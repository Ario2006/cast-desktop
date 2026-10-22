import { createIpc } from './handle.js'
import { registerActions } from './actions.js'
import { registerCalendar } from './calendar.js'
import { registerLauncher } from './launcher.js'
import { registerNotes } from './notes.js'
import { registerReminders } from './reminders.js'
import { registerSettings } from './settings.js'
import { registerSuggest } from './suggest.js'
import { registerTimers } from './timers.js'

export function registerIpc(ctx) {
  const ipc = createIpc({ windows: ctx.windows, log: ctx.log })
  for (const register of [
    registerLauncher,
    registerSuggest,
    registerActions,
    registerTimers,
    registerNotes,
    registerReminders,
    registerCalendar,
    registerSettings
  ]) {
    register(ipc, ctx)
  }
}
