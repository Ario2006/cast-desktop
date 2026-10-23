import { clipboard, dialog, shell, systemPreferences } from 'electron'
import fs from 'node:fs'
import { IPC } from '../../shared/constants.js'
import * as s from '../../shared/validate.js'
import { searchFiles } from '../actions/files.js'
import { searchContacts } from '../tools/contacts.js'
import { buildDiagnostics } from '../tools/diagnostics.js'
import { buildInsights } from '../tools/insights.js'
import { listPorts } from '../tools/ports.js'
import { applyImport, collectExport, decodeExport, encodeExport } from '../tools/sync.js'

const DAY = 86_400_000
const notFound = (what) => Object.assign(new Error(`${what} not found`), { code: 'NOT_FOUND' })
const startOfDay = (t = Date.now()) => {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
const startOfWeek = (t = Date.now()) => {
  const d = new Date(startOfDay(t))
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)) // Monday
  return d.getTime()
}

/** Tasks, time tracking, quicklinks, dev tools, briefing, insights, sync and diagnostics. */
export function registerProductivity({ handle }, ctx) {
  // --- live rows ---------------------------------------------------------------------------------
  handle(
    IPC.liveResolve,
    s.obj({ actionId: s.str(60, 1), params: s.opt(s.any(25_000)) }),
    async ({ actionId, params }) => {
      if (!ctx.live.has(actionId)) throw notFound('Resolver')
      const { getAction } = await import('../../shared/actionRegistry.js')
      const action = getAction(actionId)
      return ctx.live.resolve(actionId, action.paramsSchema(params ?? {}, 'params'))
    }
  )

  // --- tasks ---------------------------------------------------------------------------------------
  handle(IPC.tasksList, null, () => ctx.tasks.list())
  handle(IPC.tasksAdd, s.obj({ text: s.str(500, 1), due: s.opt(s.isoDate) }), ({ text, due }) =>
    ctx.addTask(text, due)
  )
  handle(
    IPC.tasksUpdate,
    s.obj({ id: s.int(1), text: s.opt(s.str(500, 1)), due: s.opt(s.any(40)), done: s.opt(s.bool) }),
    ({ id, text, due, done }) => {
      const t = ctx.tasks.get(id)
      if (!t) throw notFound('Task')
      const patch = {}
      if (text !== undefined) patch.text = text.trim()
      if (due !== undefined) patch.due = due === null ? null : Date.parse(due) || null
      if (done !== undefined) {
        patch.doneAt = done ? Date.now() : null
        // finishing a task also clears its reminder
        if (done && t.reminderId) ctx.scheduler.doneReminder(t.reminderId)
      }
      return ctx.tasks.update(id, patch)
    }
  )
  handle(IPC.tasksDelete, s.obj({ id: s.int(1) }), ({ id }) => {
    const t = ctx.tasks.get(id)
    if (t?.reminderId) ctx.scheduler.deleteReminder(t.reminderId)
    return ctx.tasks.delete(id)
  })
  handle(IPC.tasksClearDone, null, () => ctx.tasks.clearDone())

  // --- time tracking -----------------------------------------------------------------------------
  const timeStatus = () => {
    const now = Date.now()
    return {
      running: ctx.time.running(),
      today: ctx.time.totals(startOfDay(now), now + 1, now),
      week: ctx.time.totals(startOfWeek(now), now + 1, now),
      projects: ctx.time.recentProjects(),
      entries: ctx.time.entries(startOfWeek(now), 30)
    }
  }
  handle(IPC.timeStatus, null, timeStatus)
  handle(IPC.timeStart, s.obj({ project: s.str(60, 1) }), ({ project }) => {
    ctx.time.start(project.trim())
    ctx.onTrackingChange()
    return timeStatus()
  })
  handle(IPC.timeStop, null, () => {
    ctx.time.stop()
    ctx.onTrackingChange()
    return timeStatus()
  })
  handle(IPC.timeDelete, s.obj({ id: s.int(1) }), ({ id }) => {
    ctx.time.deleteEntry(id)
    ctx.onTrackingChange()
    return timeStatus()
  })

  // --- quicklinks --------------------------------------------------------------------------------
  const linkShape = {
    keyword: (x, p) => {
      s.str(20, 1)(x, p)
      if (!/^[\p{L}\p{N}._-]+$/u.test(x)) throw new s.ValidationError(`${p}: one word, no spaces`)
      return x
    },
    name: s.str(60, 1),
    url: (x, p) => {
      s.str(2000, 1)(x, p)
      if (!/^https?:\/\/\S+$/i.test(x))
        throw new s.ValidationError(`${p}: must start with http:// or https://`)
      return x
    }
  }
  const dupe = (e) =>
    /UNIQUE/i.test(e?.message)
      ? Object.assign(new Error('That keyword is already used'), { code: 'DUPLICATE' })
      : e
  const changed = (x) => (ctx.onQuicklinksChange(), x)
  handle(IPC.quicklinksList, null, () => ctx.quicklinks.list())
  handle(IPC.quicklinksCreate, s.obj(linkShape), (p) => {
    try {
      return changed(ctx.quicklinks.create(p))
    } catch (e) {
      throw dupe(e)
    }
  })
  handle(
    IPC.quicklinksUpdate,
    s.obj({
      id: s.int(1),
      ...Object.fromEntries(Object.entries(linkShape).map(([k, v]) => [k, s.opt(v)]))
    }),
    ({ id, ...p }) => {
      try {
        return changed(ctx.quicklinks.update(id, p) ?? (() => { throw notFound('Quicklink') })()) // prettier-ignore
      } catch (e) {
        throw dupe(e)
      }
    }
  )
  handle(IPC.quicklinksDelete, s.obj({ id: s.int(1) }), ({ id }) =>
    changed(ctx.quicklinks.delete(id))
  )

  // --- async suggestion sources -------------------------------------------------------------------
  handle(IPC.suggestProjects, s.obj({ query: s.str(100) }), ({ query }) =>
    ctx.projects.search(query, 5)
  )
  handle(IPC.suggestScripts, s.obj({ query: s.str(100) }), ({ query }) => {
    const q = query.toLowerCase()
    return ctx.scripts
      .list()
      .filter((x) => !q || x.title.toLowerCase().includes(q) || x.id.toLowerCase().includes(q))
      .slice(0, 5)
      .map(({ id, title, description, argument, mode }) => ({
        id,
        title,
        description,
        argument,
        mode
      }))
  })
  handle(IPC.suggestShortcuts, s.obj({ query: s.str(100) }), ({ query }) =>
    ctx.shortcuts.search(query, 5)
  )
  handle(IPC.suggestContacts, s.obj({ query: s.str(60) }), ({ query }) => searchContacts(query))

  // --- dev tools -----------------------------------------------------------------------------------
  handle(IPC.portsList, null, () => listPorts())
  handle(
    IPC.scriptsRun,
    s.obj({ id: s.str(200, 1), argument: s.opt(s.str(1000)) }),
    async ({ id, argument }) => {
      const r = await ctx.scripts.run(id, argument)
      if (r.mode === 'copy' && r.output) clipboard.writeText(r.output)
      return r
    }
  )
  handle(IPC.scriptsOpenFolder, null, () => shell.openPath(ctx.scripts.ensureFolder()))

  // --- overview -----------------------------------------------------------------------------------
  handle(IPC.insightsGet, null, () =>
    buildInsights({ db: ctx.db, tasks: ctx.tasks, time: ctx.time })
  )

  handle(IPC.briefingGet, null, async () => {
    const now = Date.now()
    const endOfDay = startOfDay(now) + DAY
    const out = {
      tasks: ctx.tasks.due(endOfDay).slice(0, 5),
      timers: ctx.scheduler.listTimers(),
      tracking: ctx.time.running(),
      reminders: ctx.scheduler
        .listReminders(50)
        .filter((r) => r.remindAt < endOfDay && r.state !== 'done')
        .slice(0, 4),
      events: null,
      weather: null
    }
    const [events, weather] = await Promise.allSettled([
      ctx.google.auth.isConnected()
        ? ctx.google.calendar.listAgenda({
            start: new Date(now).toISOString(),
            end: new Date(endOfDay).toISOString()
          })
        : Promise.resolve(null),
      ctx.live.resolve('weather.show', {})
    ])
    if (events.status === 'fulfilled' && events.value) out.events = events.value.slice(0, 5)
    if (weather.status === 'fulfilled') out.weather = weather.value
    return out
  })

  handle(IPC.searchAll, s.obj({ query: s.str(200, 1) }), async ({ query }) => {
    const q = query.toLowerCase()
    const [files] = await Promise.all([searchFiles(query, { limit: 5 }).catch(() => [])])
    return {
      notes: ctx.notes.search(query, 6),
      tasks: ctx.tasks
        .list()
        .filter((t) => t.text.toLowerCase().includes(q))
        .slice(0, 6),
      snippets: ctx.snippets.search(query, 6),
      clipboard: ctx.settings.get('clipboardHistory')
        ? ctx.clipboardHistory.list(query, 6).map((i) => ({ id: i.id, text: i.text.slice(0, 300) }))
        : [],
      quicklinks: ctx.quicklinks
        .list()
        .filter((l) => `${l.keyword} ${l.name}`.toLowerCase().includes(q))
        .slice(0, 6),
      files
    }
  })

  // --- export / import / diagnostics ------------------------------------------------------------
  handle(IPC.syncExport, s.obj({ passphrase: s.opt(s.str(200)) }), async ({ passphrase }) => {
    ctx.windows.suppressBlur(120_000)
    try {
      const date = new Date().toISOString().slice(0, 10)
      const { canceled, filePath } = await dialog.showSaveDialog(ctx.windows.window, {
        title: 'Export Cast data',
        defaultPath: `Cast export ${date}.cast.json`,
        filters: [{ name: 'Cast export', extensions: ['json'] }]
      })
      if (canceled || !filePath) return { cancelled: true }
      fs.writeFileSync(filePath, encodeExport(collectExport(ctx), passphrase || undefined), {
        mode: 0o600
      })
      return { path: filePath }
    } finally {
      ctx.windows.suppressBlur(0)
    }
  })
  handle(
    IPC.syncImport,
    s.obj({ passphrase: s.opt(s.str(200)), path: s.opt(s.str(2000)) }),
    async ({ passphrase, path }) => {
      let file = path
      if (!file) {
        ctx.windows.suppressBlur(120_000)
        try {
          const { canceled, filePaths } = await dialog.showOpenDialog(ctx.windows.window, {
            title: 'Import Cast data',
            properties: ['openFile'],
            filters: [{ name: 'Cast export', extensions: ['json'] }]
          })
          if (canceled || !filePaths[0]) return { cancelled: true }
          file = filePaths[0]
        } finally {
          ctx.windows.suppressBlur(0)
        }
      }
      if (fs.statSync(file).size > 50 * 1024 * 1024)
        throw Object.assign(new Error('That file is too large'), { code: 'INVALID' })
      const data = decodeExport(fs.readFileSync(file, 'utf8'), passphrase || undefined) // throws PASSPHRASE with a path hint
      const counts = applyImport(data, { ...ctx, setSetting: ctx.setSetting })
      ctx.onQuicklinksChange()
      return { counts, path: file }
    }
  )
  handle(IPC.diagnosticsCopy, null, () => {
    const text = buildDiagnostics({
      app: ctx.app,
      settings: ctx.settings,
      secretsStatus: ctx.secretsStatus(),
      permissions: {
        screen: systemPreferences.getMediaAccessStatus('screen'),
        microphone: systemPreferences.getMediaAccessStatus('microphone'),
        accessibility: systemPreferences.isTrustedAccessibilityClient(false)
      },
      status: ctx.currentStatus(),
      logFile: ctx.log.file,
      counts: {
        notes: ctx.db.prepare('SELECT COUNT(*) c FROM notes').get().c,
        tasks: ctx.db.prepare('SELECT COUNT(*) c FROM tasks').get().c,
        snippets: ctx.db.prepare('SELECT COUNT(*) c FROM snippets').get().c
      }
    })
    clipboard.writeText(text)
    return { length: text.length }
  })
  handle(IPC.pickFolder, s.obj({ title: s.opt(s.str(100)) }), async ({ title }) => {
    ctx.windows.suppressBlur(120_000)
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog(ctx.windows.window, {
        title: title ?? 'Choose a folder',
        properties: ['openDirectory', 'createDirectory']
      })
      return canceled ? null : (filePaths[0] ?? null)
    } finally {
      ctx.windows.suppressBlur(0)
    }
  })
}
