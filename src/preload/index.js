import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/constants.js'

// The ONLY surface the renderer gets. Every method maps to one whitelisted channel; there is
// no generic invoke/send. Invokes resolve with { ok: true, data } | { ok: false, error }.
const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload)
const send = (channel, payload) => ipcRenderer.send(channel, payload)
const subscribe = (channel, cb) => {
  const handler = (_e, payload) => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

contextBridge.exposeInMainWorld('cast', {
  launcher: {
    hide: () => send(IPC.launcherHide),
    resize: (height) => send(IPC.launcherResize, { height }),
    onShown: (cb) => subscribe(IPC.windowShown, cb),
    onHidden: (cb) => subscribe(IPC.windowHidden, cb),
    onOpenWidget: (cb) => subscribe(IPC.launcherOpenWidget, cb),
    onOpenSettings: (cb) => subscribe(IPC.launcherOpenSettings, cb)
  },
  suggest: {
    ai: (input, requestId) => invoke(IPC.suggestAi, { input, requestId }),
    cancel: (requestId) => send(IPC.suggestCancel, { requestId }),
    files: (query) => invoke(IPC.suggestFiles, { query }),
    notes: (query) => invoke(IPC.suggestNotes, { query }),
    snippets: (query) => invoke(IPC.suggestSnippets, { query })
  },
  history: {
    stats: () => invoke(IPC.historyStats),
    recent: () => invoke(IPC.historyRecent),
    record: (actionId, summary) => invoke(IPC.historyRecord, { actionId, summary }),
    clear: () => invoke(IPC.historyClear),
    learned: () => invoke(IPC.historyLearned),
    learn: (shape, actionId) => invoke(IPC.historyLearn, { shape, actionId }),
    clearLearned: () => invoke(IPC.historyClearLearned)
  },
  pomodoro: {
    get: () => invoke(IPC.pomodoroGet),
    start: () => invoke(IPC.pomodoroStart),
    skip: () => invoke(IPC.pomodoroSkip),
    stop: () => invoke(IPC.pomodoroStop)
  },
  clipboard: {
    list: (query) => invoke(IPC.clipboardList, { query }),
    copy: (id) => invoke(IPC.clipboardCopy, { id }),
    clear: () => invoke(IPC.clipboardClear)
  },
  snippets: {
    list: (query) => invoke(IPC.snippetsList, { query }),
    create: (p) => invoke(IPC.snippetsCreate, p),
    update: (p) => invoke(IPC.snippetsUpdate, p),
    delete: (id) => invoke(IPC.snippetsDelete, { id }),
    copy: (id) => invoke(IPC.snippetsCopy, { id })
  },
  currency: {
    convert: (amount, from, to) => invoke(IPC.currencyConvert, { amount, from, to })
  },
  actions: {
    run: (actionId, params) => invoke(IPC.actionRun, { actionId, params })
  },
  timers: {
    list: () => invoke(IPC.timerList),
    get: (id) => invoke(IPC.timerGet, { id }),
    start: (payload) => invoke(IPC.timerStart, payload),
    control: (id, op, value) => invoke(IPC.timerControl, { id, op, value }),
    onUpdate: (cb) => subscribe(IPC.timerUpdate, cb)
  },
  notes: {
    create: (p) => invoke(IPC.notesCreate, p),
    update: (p) => invoke(IPC.notesUpdate, p),
    get: (id) => invoke(IPC.notesGet, { id }),
    delete: (id) => invoke(IPC.notesDelete, { id }),
    search: (query, limit) => invoke(IPC.notesSearch, { query, limit }),
    clear: () => invoke(IPC.notesClear)
  },
  reminders: {
    create: (p) => invoke(IPC.remindersCreate, p),
    update: (p) => invoke(IPC.remindersUpdate, p),
    list: () => invoke(IPC.remindersList),
    snooze: (id, minutes) => invoke(IPC.remindersSnooze, { id, minutes }),
    done: (id) => invoke(IPC.remindersDone, { id }),
    delete: (id) => invoke(IPC.remindersDelete, { id }),
    clear: () => invoke(IPC.remindersClear)
  },
  calendar: {
    status: () => invoke(IPC.calendarStatus),
    connect: () => invoke(IPC.calendarConnect),
    disconnect: () => invoke(IPC.calendarDisconnect),
    calendars: () => invoke(IPC.calendarCalendars),
    conflicts: (p) => invoke(IPC.calendarConflicts, p),
    create: (p) => invoke(IPC.calendarCreate, p),
    undo: (eventId, calendarId) => invoke(IPC.calendarUndo, { eventId, calendarId }),
    agenda: (day) => invoke(IPC.calendarAgenda, { day })
  },
  capture: {
    start: (kind, options) => invoke(IPC.captureStart, { kind, options }),
    stop: () => invoke(IPC.captureStop)
  },
  settings: {
    getAll: () => invoke(IPC.settingsGetAll),
    set: (key, value) => invoke(IPC.settingsSet, { key, value }),
    onChange: (cb) => subscribe(IPC.settingsChanged, cb),
    setSecret: (name, value) => invoke(IPC.secretsSet, { name, value }),
    secretsStatus: () => invoke(IPC.secretsStatus),
    testAi: () => invoke(IPC.aiTest)
  },
  status: {
    get: () => invoke(IPC.statusGet),
    onUpdate: (cb) => subscribe(IPC.statusUpdate, cb)
  },
  permissions: {
    status: () => invoke(IPC.permissionsStatus),
    open: (type) => invoke(IPC.permissionsOpen, { type })
  },
  app: {
    info: () => invoke(IPC.appInfo),
    openPath: (target) => invoke(IPC.appOpenPath, { target }),
    logs: () => invoke(IPC.appLogs),
    copy: (text) => invoke(IPC.clipboardWrite, { text })
  }
})
