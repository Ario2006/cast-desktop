import { getAction, isEnabled } from '../../shared/actionRegistry.js'
import { IPC } from '../../shared/constants.js'
import * as s from '../../shared/validate.js'

const bad = (code, message) => Object.assign(new Error(message), { code })

export function registerActions({ handle }, ctx) {
  handle(
    IPC.actionRun,
    s.obj({ actionId: s.str(60, 1), params: s.opt(s.any(4000)) }),
    async (p) => {
      const action = getAction(p.actionId)
      if (!action) throw bad('UNKNOWN_ACTION', 'Unknown action')
      const settings = ctx.settings.all()
      if (!isEnabled(action, settings, { recording: ctx.recorder.isRecording() }))
        throw bad('DISABLED', 'This action is disabled')
      if (!ctx.runner.has(action.id))
        throw bad('NOT_INSTANT', 'This action runs inside the launcher')

      const params = action.paramsSchema(p.params ?? {}, 'params')
      const result = await ctx.runner.run(action.id, params)

      if (settings.keepHistory) {
        const { title } = action.describe(params, { now: new Date(), settings })
        ctx.history.record(action.id, title.slice(0, 120))
      }
      if (result.hide !== false) ctx.windows.hide()
      return { message: result.message, path: result.path, cancelled: result.cancelled }
    }
  )

  // Same executors are reachable from the capture channels used by Settings / tray.
  handle(
    IPC.captureStart,
    s.obj({
      kind: s.oneOf('screenshot', 'recording'),
      options: s.opt(
        s.obj({ variant: s.opt(s.oneOf('full', 'area', 'window')), audio: s.opt(s.bool) })
      )
    }),
    async ({ kind, options }) => {
      if (kind === 'screenshot') return ctx.screenshot(options?.variant ?? 'full')
      return ctx.recorder.start({ audio: options?.audio })
    }
  )
  handle(IPC.captureStop, null, () => ctx.recorder.stop())
}
