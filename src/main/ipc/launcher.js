import { clipboard, shell } from 'electron'
import { IPC } from '../../shared/constants.js'
import * as s from '../../shared/validate.js'

export function registerLauncher({ handle, on }, ctx) {
  on(IPC.launcherHide, null, () => ctx.windows.hide())
  on(IPC.launcherResize, s.obj({ height: s.num(0, 4000) }), ({ height }) =>
    ctx.windows.resize(height)
  )
  handle(IPC.clipboardWrite, s.obj({ text: s.str(20000) }), ({ text }) => {
    clipboard.writeText(text)
  })
  handle(IPC.appInfo, null, () => ({
    version: ctx.app.getVersion(),
    dataDir: ctx.dataDir,
    logFile: ctx.log.file,
    platform: process.platform
  }))
  handle(IPC.appOpenPath, s.obj({ target: s.oneOf('data', 'logs') }), ({ target }) => {
    if (target === 'data') return shell.openPath(ctx.dataDir)
    shell.showItemInFolder(ctx.log.file)
  })
}
