import { join } from 'node:path'
import {
  app,
  clipboard,
  nativeImage,
  nativeTheme,
  powerMonitor,
  safeStorage,
  shell,
  systemPreferences
} from 'electron'
import { IPC } from '../shared/constants.js'
import { validateSetting } from '../shared/settings.js'
import { createScreenshotter } from './actions/capture.js'
import ffmpegStatic from 'ffmpeg-static'
import { toMp4, unpackedPath } from './actions/convert.js'
import { warmApps } from './actions/files.js'
import { createActionRunner } from './actions/index.js'
import { createRecorder } from './actions/recording.js'
import { createAiService } from './ai/service.js'
import { createClipboardHistory } from './clipboardHistory.js'
import { createCurrencyService } from './currency.js'
import { openDb } from './db/index.js'
import { choicesRepo, snippetsRepo } from './db/features.js'
import { capturesRepo, historyRepo } from './db/history.js'
import { notesRepo } from './db/notes.js'
import { createCalendarClient } from './google/calendar.js'
import { createGoogleAuth } from './google/oauth.js'
import { registerIpc } from './ipc/index.js'
import { createLogger } from './log.js'
import { showNotification } from './notifications.js'
import { createScheduler } from './scheduler.js'
import { createSecretStore } from './secrets.js'
import { createSettingsStore } from './settingsStore.js'
import { createShortcuts } from './shortcuts.js'
import { createTray } from './tray.js'
import { createWindows, rendererUrl } from './windows.js'

app.setName('Cast')
// CAST_USER_DATA lets tests / smoke runs use a throwaway data directory.
app.setPath('userData', process.env.CAST_USER_DATA || join(app.getPath('appData'), 'Cast'))

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  start()
}

function start() {
  let windows = null
  app.on('second-instance', () => windows?.show())
  // Menu-bar app: closing/hiding the launcher must never quit.
  app.on('window-all-closed', () => {})
  app.on('activate', () => windows?.show())

  app.whenReady().then(async () => {
    // the sync availability check is deprecated; resolve it once up front
    const encryption = await safeStorage.isAsyncEncryptionAvailable()
    boot((w) => (windows = w), encryption)
  })
}

function boot(setWindows, encryptionAvailable) {
  app.dock?.hide()

  const dataDir = app.getPath('userData')
  const log = createLogger(join(dataDir, 'logs'))
  log.info('starting', { version: app.getVersion(), electron: process.versions.electron })

  const db = openDb(join(dataDir, 'cast.db'))
  const notes = notesRepo(db)
  const history = historyRepo(db)
  const captures = capturesRepo(db)
  const choices = choicesRepo(db)
  const snippets = snippetsRepo(db)
  const secrets = createSecretStore({
    file: join(dataDir, 'secrets.bin'),
    safeStorage,
    isAvailable: () => encryptionAvailable
  })

  // --- state shared with the renderer ------------------------------------------------------
  let recordingState = { recording: false, startedAt: null }
  let ai, tray, shortcuts, scheduler
  const currentStatus = () => ({ recording: recordingState.recording, ai: ai.getStatus() })
  const emitStatus = () => windows.send(IPC.statusUpdate, currentStatus())

  const settings = createSettingsStore({
    db,
    onChange: (key, value) => {
      applySetting(key, value)
      windows?.send(IPC.settingsChanged, { key, value })
    }
  })

  const windows = createWindows({ getSettings: settings.all, log })
  setWindows(windows)

  const openWidget = (actionId, params) => windows.show({ widget: { actionId, params } })

  // --- services ---------------------------------------------------------------------------
  ai = createAiService({
    getSettings: settings.all,
    getApiKey: () => secrets.get('aiApiKey'),
    onStatus: () => windows?.webContents && emitStatus(),
    log
  })

  const googleAuth = createGoogleAuth({
    secrets,
    getClientId: () => settings.get('googleClientId'),
    openExternal: (url) => shell.openExternal(url)
  })
  const google = { auth: googleAuth, calendar: createCalendarClient({ auth: googleAuth }) }

  const notify = (opts) => showNotification(opts)

  const currency = createCurrencyService({ file: join(dataDir, 'rates.json'), log })
  const clipboardHistory = createClipboardHistory({ clipboard })
  const ffmpeg = unpackedPath(ffmpegStatic)

  const screenshot = createScreenshotter({
    getSettings: settings.all,
    systemPreferences,
    clipboard,
    nativeImage,
    shell,
    capturesRepo: captures,
    hideLauncher: () => windows.hide(),
    notify,
    log
  })

  const recorder = createRecorder({
    getSettings: settings.all,
    systemPreferences,
    shell,
    capturesRepo: captures,
    hideLauncher: () => windows.hide(),
    notify,
    log,
    convertToMp4: (input, output) => toMp4({ ffmpeg, input, output }),
    recorderPage: {
      preload: join(__dirname, '../preload/recorder.js'),
      url: rendererUrl('recorder.html')
    },
    onChange: (state) => {
      recordingState = state
      shortcuts.setRecordingActive(state.recording, settings.get('stopRecordingShortcut'))
      tray.refresh()
      emitStatus()
    }
  })

  const runner = createActionRunner({
    getSettings: settings.all,
    screenshot,
    recorder,
    currency,
    snippets
  })

  scheduler = createScheduler({
    db,
    getPomodoroConfig: () => {
      const s = settings.all()
      return {
        focus: s.pomodoroFocusMinutes,
        short: s.pomodoroShortBreakMinutes,
        long: s.pomodoroLongBreakMinutes,
        cycles: s.pomodoroCycles
      }
    },
    notify: (n) => {
      const s = settings.all()
      if (n.kind === 'timer' || n.kind === 'pomodoro') {
        showNotification({
          title: n.title,
          body: n.body,
          sound: s.timerSound,
          onClick: () =>
            n.kind === 'pomodoro'
              ? openWidget('pomodoro.start', {})
              : openWidget('timer.start', { timerId: n.timerId })
        })
        tray.flash()
      } else {
        showNotification({
          title: n.title,
          body: n.body,
          sound: 'Glass',
          actions: [
            { text: 'Snooze 10 min', onAction: () => scheduler.snoozeReminder(n.reminderId, 10) },
            { text: 'Done', onAction: () => scheduler.doneReminder(n.reminderId) }
          ],
          onClick: () => openWidget('reminder.create', { reminderId: n.reminderId })
        })
      }
    },
    onChange: (snapshot) => {
      windows.send(IPC.timerUpdate, snapshot)
      tray?.refresh()
    }
  })

  shortcuts = createShortcuts({
    onToggle: () => windows.toggle(),
    onStopRecording: () => recorder.stop(),
    log
  })

  // --- settings side effects ---------------------------------------------------------------
  function applySetting(key, value) {
    switch (key) {
      case 'launchAtLogin':
        if (app.getLoginItemSettings().openAtLogin !== value) {
          try {
            app.setLoginItemSettings({ openAtLogin: value })
          } catch (e) {
            log.warn('login item failed', e) // e.g. unsigned dev builds
          }
        }
        break
      case 'clipboardHistory':
        if (value) clipboardHistory.start()
        else clipboardHistory.stop()
        break
      case 'trayTimerTitle':
        tray?.refresh()
        break
      case 'smartSuggestions':
      case 'aiProvider':
      case 'aiBaseUrl':
      case 'aiModel':
        if (windows?.webContents) emitStatus()
        break
      case 'stopRecordingShortcut':
        if (recordingState.recording) shortcuts.setRecordingActive(true, value)
        break
    }
  }

  function setSetting(key, value) {
    const normalized = validateSetting(key, value)
    if (key === 'shortcut') {
      const r = shortcuts.setLauncherShortcut(normalized)
      if (!r.ok) throw Object.assign(new Error(r.error), { code: 'SHORTCUT_CONFLICT' })
    }
    return settings.set(key, normalized)
  }

  const secretsStatus = () => ({
    aiApiKey: secrets.has('aiApiKey'),
    googleClientSecret: secrets.has('googleClientSecret'),
    googleConnected: googleAuth.isConnected(),
    encryptionAvailable
  })

  // --- UI shell ---------------------------------------------------------------------------
  windows.create()
  nativeTheme.themeSource = 'light' // the design system is light-only

  tray = createTray({
    getTimers: () => scheduler.listTimers(),
    getRecording: () => recordingState,
    getTitleEnabled: () => settings.get('trayTimerTitle'),
    actions: {
      toggle: () => windows.toggle(),
      open: () => windows.show(),
      openWidget,
      openSettings: () => windows.show({ settings: true }),
      stopRecording: () => recorder.stop(),
      checkPermissions: () => windows.show({ settings: true, section: 'permissions' }),
      quit: () => app.quit()
    }
  })

  const reg = shortcuts.setLauncherShortcut(settings.get('shortcut'))
  log.info('launcher shortcut', { accelerator: settings.get('shortcut'), registered: reg.ok })
  if (!reg.ok) {
    showNotification({
      title: 'Cast shortcut unavailable',
      body: reg.error,
      onClick: () => windows.show({ settings: true })
    })
  }

  registerIpc({
    app,
    log,
    dataDir,
    windows,
    settings,
    setSetting,
    secrets,
    secretsStatus,
    notes,
    history,
    choices,
    snippets,
    currency,
    clipboardHistory,
    scheduler,
    ai,
    google,
    runner,
    recorder,
    screenshot,
    emitStatus,
    currentStatus
  })

  // Test / dev hook: CAST_SETTINGS='{"onboarded":true}' overrides settings for this run.
  if (process.env.CAST_SETTINGS) {
    for (const [k, v] of Object.entries(JSON.parse(process.env.CAST_SETTINGS))) setSetting(k, v)
  }

  scheduler.init()
  powerMonitor.on('resume', () => scheduler.onResume())
  powerMonitor.on('unlock-screen', () => scheduler.onResume())
  applySetting('launchAtLogin', settings.get('launchAtLogin'))
  applySetting('clipboardHistory', settings.get('clipboardHistory'))
  warmApps()

  // Finalize an in-progress recording before quitting so the file stays playable.
  let quitting = false
  app.on('before-quit', (e) => {
    if (quitting || !recorder.isRecording()) return
    e.preventDefault()
    quitting = true
    recorder.stop().finally(() => app.quit())
  })
  app.on('will-quit', () => {
    shortcuts.unregisterAll()
    scheduler.dispose()
    tray.destroy()
    db.close()
  })

  // First run: open the launcher once so the welcome walkthrough is the first thing you see.
  if (!settings.get('onboarded') && !process.env.CAST_SMOKE) setTimeout(() => windows.show(), 700)
  if (process.env.CAST_E2E) windows.show()

  if (process.env.CAST_SMOKE) {
    import('./smoke.js').then((m) => m.runSmoke({ windows, log, app, setSetting }))
  }
}
