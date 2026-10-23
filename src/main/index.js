import { join } from 'node:path'
import {
  screen,
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
import { createLiveResolver } from './live.js'
import { quicklinksRepo, tasksRepo, timeRepo } from './db/productivity.js'
import { createQuickCapture } from './tools/capture.js'
import { contactUrl } from './tools/contacts.js'
import { killPort } from './tools/ports.js'
import { createProjects } from './tools/projects.js'
import { createScripts } from './tools/scripts.js'
import { createShortcutsService } from './tools/shortcuts.js'
import { runSystemCommand } from './tools/system.js'
import { createWindowLayout } from './tools/windowLayout.js'
import { openDb } from './db/index.js'
import { choicesRepo, snippetsRepo } from './db/features.js'
import { capturesRepo, historyRepo } from './db/history.js'
import { notesRepo } from './db/notes.js'
import { createCalendarClient } from './google/calendar.js'
import { BUNDLED_GOOGLE } from './google/bundled.js'
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
  const tasks = tasksRepo(db)
  const time = timeRepo(db)
  const quicklinks = quicklinksRepo(db)
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
    // your quicklinks, scripts and Shortcuts become extra things the classifier can choose
    getCustomLabels: async () => [
      ...quicklinks.list().map((q) => ({
        label: `ql:${q.keyword}`,
        hint: `Open ${q.name} (${q.keyword})`,
        actionId: 'quicklink.open',
        params: { id: q.id, name: q.name, url: q.url.replace(/\{query\}/g, '') }
      })),
      ...scripts.list().map((x) => ({
        label: `script:${x.id}`,
        hint: `Run the script “${x.title}”${x.description ? `: ${x.description}` : ''}`,
        actionId: 'script.run',
        params: { id: x.id, title: x.title, takesArgument: Boolean(x.argument) }
      })),
      ...(await shortcutsService.list()).slice(0, 20).map((name) => ({
        label: `sc:${name}`,
        hint: `Run the macOS Shortcut “${name}”`,
        actionId: 'shortcut.run',
        params: { name }
      }))
    ],
    onStatus: () => windows?.webContents && emitStatus(),
    log
  })

  const googleAuth = createGoogleAuth({
    secrets,
    // a user-supplied client wins; otherwise the one-click client compiled into the app
    getClientId: () => settings.get('googleClientId') || BUNDLED_GOOGLE.clientId || '',
    getClientSecret: () =>
      settings.get('googleClientId')
        ? secrets.get('googleClientSecret') || undefined
        : BUNDLED_GOOGLE.clientSecret || undefined,
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

  const shortcutsService = createShortcutsService()
  const projects = createProjects({ getSettings: settings.all })
  const scripts = createScripts({ getSettings: settings.all })
  const capture = createQuickCapture({ getSettings: settings.all, secrets })
  const live = createLiveResolver({
    clipboard,
    getSettings: settings.all,
    currency,
    calendarNext: () =>
      googleAuth.isConnected() ? google.calendar.nextMeeting() : Promise.resolve(null)
  })

  /** Add a task; a due date in the future also gets a reminder so it actually notifies you. */
  function addTask(text, dueIso) {
    const due = dueIso ? Date.parse(dueIso) : null
    let reminderId = null
    if (due && due > Date.now() && settings.get('taskReminders')) {
      reminderId = scheduler.createReminder({ text: `Task: ${text}`, remindAt: due }).id
    }
    return tasks.create({ text, due, reminderId })
  }

  const runner = createActionRunner({
    getSettings: settings.all,
    screenshot,
    recorder,
    currency,
    snippets,
    tools: {
      runSystemCommand,
      applyLayout: createWindowLayout({
        screen,
        systemPreferences,
        hideLauncher: () => windows.hide()
      }),
      contactUrl,
      shortcuts: shortcutsService,
      projects,
      killPort,
      addTask,
      time,
      capture,
      onTrackingChange: () => tray?.refresh()
    }
  })

  // Focus mode: run your own "Focus on/off" Shortcuts as Pomodoro moves between focus and breaks
  let focusOn = false
  const setFocus = (on) => {
    if (on === focusOn) return
    focusOn = on
    const name = settings.get(on ? 'focusShortcutOn' : 'focusShortcutOff')
    if (name)
      shortcutsService.run(name).catch((e) => log.warn('focus shortcut failed', { code: e.code }))
  }

  scheduler = createScheduler({
    db,
    onPomodoroPhase: (phase) => setFocus(phase === 'focus'),
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
          sound: s.timerSound,
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
      case 'theme':
        nativeTheme.themeSource = value
        break
      case 'trayDisplay':
        refreshTrayExtra?.()
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
    googleBuiltin: Boolean(BUNDLED_GOOGLE.clientId),
    notionToken: secrets.has('notionToken'),
    googleConnected: googleAuth.isConnected(),
    encryptionAvailable
  })

  // --- UI shell ---------------------------------------------------------------------------
  windows.create()
  nativeTheme.themeSource = settings.get('theme')

  tray = createTray({
    getTimers: () => scheduler.listTimers(),
    getRecording: () => recordingState,
    getTitleEnabled: () => settings.get('trayTimerTitle'),
    getExtraTitle: () => trayExtra,
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

  // Optional menu-bar text: next meeting or current weather (refreshed every 5 minutes)
  let trayExtra = ''
  async function refreshTrayExtra() {
    const mode = settings.get('trayDisplay')
    try {
      if (mode === 'weather') {
        trayExtra = (await live.resolve('weather.show', {})).short ?? ''
      } else if (mode === 'meeting' && googleAuth.isConnected()) {
        const ev = await google.calendar.nextMeeting()
        const mins = ev ? Math.round((Date.parse(ev.start) - Date.now()) / 60_000) : null
        trayExtra =
          ev && mins <= 60 ? `${ev.title.slice(0, 18)} ${mins > 0 ? `in ${mins}m` : 'now'}` : ''
      } else trayExtra = ''
    } catch {
      trayExtra = ''
    }
    tray.refresh()
  }
  setInterval(refreshTrayExtra, 5 * 60_000).unref?.()
  setTimeout(refreshTrayExtra, 3000).unref?.()

  registerIpc({
    db,
    tasks,
    time,
    quicklinks,
    live,
    projects,
    scripts,
    shortcuts: shortcutsService,
    addTask,
    onTrackingChange: () => tray.refresh(),
    onQuicklinksChange: () => windows.send(IPC.quicklinksChanged),
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
  if (!settings.get('onboarded') && !process.env.CAST_SMOKE)
    setTimeout(() => windows.show({ activate: true }), 900)
  if (process.env.CAST_E2E) windows.show()

  if (process.env.CAST_SMOKE) {
    import('./smoke.js').then((m) => m.runSmoke({ windows, log, app, setSetting }))
  }
}
