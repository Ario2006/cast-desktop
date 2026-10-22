import { shell, systemPreferences } from 'electron'
import { IPC } from '../../shared/constants.js'
import { SETTING_KEYS } from '../../shared/settings.js'
import * as s from '../../shared/validate.js'

const PANES = {
  screen: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
  microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
  notifications: 'x-apple.systempreferences:com.apple.Notifications-Settings.extension'
}

const SECRET_NAMES = ['aiApiKey', 'googleClientSecret']

export function registerSettings({ handle }, ctx) {
  handle(IPC.settingsGetAll, null, () => ctx.settings.all())
  handle(IPC.settingsGet, s.obj({ key: s.oneOf(...SETTING_KEYS) }), ({ key }) =>
    ctx.settings.get(key)
  )
  handle(IPC.settingsSet, s.obj({ key: s.str(60, 1), value: s.any(4000) }), ({ key, value }) =>
    ctx.setSetting(key, value)
  )

  // Secrets are write-only from the renderer's point of view.
  handle(
    IPC.secretsSet,
    s.obj({ name: s.oneOf(...SECRET_NAMES), value: s.str(2000) }),
    ({ name, value }) => {
      if (value === '') ctx.secrets.delete(name)
      else ctx.secrets.set(name, value.trim())
      if (name === 'aiApiKey') ctx.emitStatus()
      return ctx.secretsStatus()
    }
  )
  handle(IPC.secretsStatus, null, () => ctx.secretsStatus())
  handle(IPC.aiTest, null, () => ctx.ai.test())

  handle(IPC.statusGet, null, () => ctx.currentStatus())

  handle(IPC.permissionsStatus, null, () => ({
    screen: systemPreferences.getMediaAccessStatus('screen'),
    microphone: systemPreferences.getMediaAccessStatus('microphone')
  }))
  handle(
    IPC.permissionsOpen,
    s.obj({ type: s.oneOf('screen', 'microphone', 'notifications') }),
    async ({ type }) => {
      if (
        type === 'microphone' &&
        systemPreferences.getMediaAccessStatus('microphone') === 'not-determined'
      ) {
        await systemPreferences.askForMediaAccess('microphone')
      }
      await shell.openExternal(PANES[type])
    }
  )
}
