import { IPC } from '../../shared/constants.js'
import * as s from '../../shared/validate.js'

const repeat = s.opt(s.oneOf('none', 'daily', 'weekly'))

export function registerReminders({ handle }, ctx) {
  handle(IPC.remindersCreate, s.obj({ text: s.str(500, 1), remindAt: s.isoDate, repeat }), (p) =>
    ctx.scheduler.createReminder({
      text: p.text.trim(),
      remindAt: Date.parse(p.remindAt),
      repeat: p.repeat
    })
  )
  handle(
    IPC.remindersUpdate,
    s.obj({ id: s.int(1), text: s.opt(s.str(500, 1)), remindAt: s.opt(s.isoDate), repeat }),
    ({ id, text, remindAt, repeat: rep }) =>
      ctx.scheduler.updateReminder(id, {
        ...(text !== undefined ? { text: text.trim() } : {}),
        ...(remindAt !== undefined ? { remindAt: Date.parse(remindAt) } : {}),
        ...(rep !== undefined ? { repeat: rep } : {})
      })
  )
  handle(IPC.remindersList, null, () => ctx.scheduler.listReminders(50))
  handle(
    IPC.remindersSnooze,
    s.obj({ id: s.int(1), minutes: s.opt(s.int(1, 1440)) }),
    ({ id, minutes }) => ctx.scheduler.snoozeReminder(id, minutes ?? 10)
  )
  handle(IPC.remindersDone, s.obj({ id: s.int(1) }), ({ id }) => ctx.scheduler.doneReminder(id))
  handle(IPC.remindersDelete, s.obj({ id: s.int(1) }), ({ id }) => ctx.scheduler.deleteReminder(id))
  handle(IPC.remindersClear, null, () => ctx.scheduler.clearReminders())
}
