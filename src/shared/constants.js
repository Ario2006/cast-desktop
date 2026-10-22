export const APP_NAME = 'Cast'

export const WINDOW = {
  width: 680,
  inputHeight: 56,
  maxContentHeight: 420,
  footerHeight: 34,
  topOffsetRatio: 0.2
}

export const MAX_SUGGESTIONS = 7
export const AI_DEBOUNCE_MS = 300
export const AI_TIMEOUT_MS = 2500
export const AI_MIN_INPUT = 3
export const AI_MAX_INTENTS = 4
export const AI_MIN_INTERVAL_MS = 334 // ~3 requests/second
export const UNDO_WINDOW_MS = 10_000

/** Renderer <-> main IPC channels. Only these are exposed through the preload bridge. */
export const IPC = {
  launcherHide: 'launcher:hide',
  launcherResize: 'launcher:resize',
  launcherOpenWidget: 'launcher:open-widget',
  launcherOpenSettings: 'launcher:open-settings',
  windowShown: 'window:shown',
  windowHidden: 'window:hidden',
  suggestAi: 'suggest:ai',
  suggestCancel: 'suggest:cancel',
  suggestFiles: 'suggest:files',
  suggestNotes: 'suggest:notes',
  actionRun: 'action:run',
  historyStats: 'history:stats',
  historyRecent: 'history:recent',
  historyRecord: 'history:record',
  historyClear: 'history:clear',
  timerList: 'timer:list',
  timerGet: 'timer:get',
  timerStart: 'timer:start',
  timerControl: 'timer:control',
  timerUpdate: 'timer:update',
  notesCreate: 'notes:create',
  notesUpdate: 'notes:update',
  notesGet: 'notes:get',
  notesDelete: 'notes:delete',
  notesSearch: 'notes:search',
  notesClear: 'notes:clear',
  remindersCreate: 'reminders:create',
  remindersUpdate: 'reminders:update',
  remindersList: 'reminders:list',
  remindersSnooze: 'reminders:snooze',
  remindersDone: 'reminders:done',
  remindersDelete: 'reminders:delete',
  remindersClear: 'reminders:clear',
  calendarStatus: 'calendar:status',
  calendarConnect: 'calendar:connect',
  calendarDisconnect: 'calendar:disconnect',
  calendarCalendars: 'calendar:calendars',
  calendarConflicts: 'calendar:conflicts',
  calendarCreate: 'calendar:create',
  calendarUndo: 'calendar:undo',
  captureStart: 'capture:start',
  captureStop: 'capture:stop',
  settingsGet: 'settings:get',
  settingsGetAll: 'settings:get-all',
  settingsSet: 'settings:set',
  settingsChanged: 'settings:changed',
  secretsSet: 'secrets:set',
  secretsStatus: 'secrets:status',
  aiTest: 'ai:test',
  statusUpdate: 'status:update',
  statusGet: 'status:get',
  permissionsStatus: 'permissions:status',
  permissionsOpen: 'permissions:open',
  clipboardWrite: 'clipboard:write',
  appInfo: 'app:info',
  appOpenPath: 'app:open-path'
}
