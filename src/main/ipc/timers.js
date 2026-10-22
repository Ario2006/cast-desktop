import { IPC } from '../../shared/constants.js'
import * as s from '../../shared/validate.js'

export function registerTimers({ handle }, ctx) {
  handle(IPC.timerList, null, () => ctx.scheduler.listTimers())
  handle(IPC.timerGet, s.obj({ id: s.int(1) }), ({ id }) => ctx.scheduler.getTimer(id))
  handle(
    IPC.timerStart,
    s.obj({
      kind: s.oneOf('timer', 'stopwatch'),
      durationSeconds: s.opt(s.int(1, 99 * 3600)),
      label: s.opt(s.str(80))
    }),
    ({ kind, durationSeconds, label }) => {
      if (kind === 'stopwatch') return ctx.scheduler.startStopwatch({ label })
      if (!durationSeconds) throw Object.assign(new Error('Duration required'), { code: 'INVALID' })
      return ctx.scheduler.startTimer({ durationSeconds, label })
    }
  )
  handle(
    IPC.timerControl,
    s.obj({
      id: s.int(1),
      op: s.oneOf('pause', 'resume', 'reset', 'restart', 'add', 'lap', 'cancel', 'rename'),
      value: s.opt(s.any(200))
    }),
    ({ id, op, value }) => ctx.scheduler.control(id, op, value)
  )
}
