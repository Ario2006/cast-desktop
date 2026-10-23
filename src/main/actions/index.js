import fs from 'node:fs'
import path from 'node:path'
import { clipboard, shell } from 'electron'
import { convertUnits, evaluateMath } from '../../shared/calc.js'
import { normalizeUrl } from '../../shared/search.js'
import { searchUrlFor } from '../../shared/suggest.js'
import { formatMoney } from '../../shared/currency.js'
import { expandHome } from './paths.js'

const fail = (code, message) => Object.assign(new Error(message), { code })

const APP_DIRS = ['/Applications/', '/System/Applications/', `${process.env.HOME}/Applications/`]

async function open(target) {
  const err = await shell.openPath(target)
  if (err) throw fail('OPEN_FAILED', err)
}

/**
 * Main-side executors for `instant` actions. Widget actions (timer, notes, reminders, calendar)
 * go through their own domain IPC channels instead.
 *
 * Each executor returns { message?, hide? } — `hide` defaults to true.
 */
const safeWebUrl = (u) => (/^https?:\/\/\S+$/i.test(String(u)) ? String(u) : null)

export function createActionRunner({
  getSettings,
  screenshot,
  recorder,
  currency,
  snippets,
  tools = {}
}) {
  const executors = {
    'calc.evaluate'({ expression }) {
      const r = evaluateMath(expression)
      if (!r) throw fail('INVALID', 'Not a valid expression')
      clipboard.writeText(r.display)
      return { message: `Copied ${r.display}`, hide: false }
    },
    'convert.units'({ input }) {
      const r = convertUnits(input)
      if (!r) throw fail('INVALID', 'Cannot convert these units')
      clipboard.writeText(r.text)
      return { message: `Copied ${r.text}`, hide: false }
    },
    async 'currency.convert'({ amount, from, to }) {
      const r = await currency.convert(amount, from, to)
      const text = formatMoney(r.value, to)
      clipboard.writeText(text)
      return { message: `Copied ${text}${r.stale ? ' (offline rates)' : ''}`, hide: false }
    },
    'snippet.copy'({ id }) {
      const snip = snippets.get(id)
      if (!snip) throw fail('NOT_FOUND', 'Snippet not found')
      clipboard.writeText(snip.body)
      return { message: `Copied “${snip.name}”`, hide: false }
    },
    async 'file.open'({ path: p, reveal }) {
      const abs = path.resolve(expandHome(p))
      if (!fs.existsSync(abs)) throw fail('NOT_FOUND', `${p} does not exist`)
      if (reveal) shell.showItemInFolder(abs)
      else await open(abs)
      return {}
    },
    async 'app.open'({ path: p }) {
      const abs = path.resolve(p)
      if (!abs.endsWith('.app') || !APP_DIRS.some((d) => abs.startsWith(d)))
        throw fail('INVALID', 'Not an application')
      await open(abs)
      return {}
    },
    async 'web.search'(params) {
      await shell.openExternal(searchUrlFor(params, getSettings()))
      return {}
    },
    async 'web.openUrl'({ url }) {
      const safe = normalizeUrl(url)
      if (!safe) throw fail('INVALID', 'Not a valid web address')
      await shell.openExternal(safe)
      return {}
    },
    async 'screenshot.full'() {
      return { ...(await screenshot('full')), hide: true }
    },
    async 'screenshot.area'() {
      return { ...(await screenshot('area')), hide: true }
    },
    async 'screenshot.window'() {
      return { ...(await screenshot('window')), hide: true }
    },
    async 'record.start'({ audio }) {
      await recorder.start({ audio })
      return { message: 'Recording…' }
    },
    async 'record.stop'() {
      await recorder.stop()
      return {}
    },

    // --- everyday / system ---------------------------------------------------------------------
    async 'system.command'(p) {
      const message = await tools.runSystemCommand(p)
      return { message }
    },
    async 'window.layout'({ layout }) {
      await tools.applyLayout(layout)
      return {}
    },
    async 'contact.open'({ via, value }) {
      const url = tools.contactUrl(via, value)
      if (!url) throw fail('INVALID', 'That contact has no usable number')
      await shell.openExternal(url)
      return {}
    },
    async 'shortcut.run'({ name }) {
      const out = await tools.shortcuts.run(name)
      if (out) clipboard.writeText(out)
      return { message: out ? `“${name}” finished · output copied` : `Ran “${name}”` }
    },

    // --- developers --------------------------------------------------------------------------------
    async 'docs.search'({ url }) {
      const safe = safeWebUrl(url)
      if (!safe) throw fail('INVALID', 'Not a web address')
      await shell.openExternal(safe)
      return {}
    },
    async 'quicklink.open'({ url }) {
      const safe = safeWebUrl(url)
      if (!safe) throw fail('INVALID', 'Quicklinks must be http(s) addresses')
      await shell.openExternal(safe)
      return {}
    },
    async 'project.open'({ path: p, target }) {
      await tools.projects.open(p, target ?? 'editor')
      return {}
    },
    async 'port.kill'({ port, confirmed }) {
      return { message: await tools.killPort(port, { confirmed }) }
    },

    // --- productivity --------------------------------------------------------------------------------
    'task.add'({ text, due }) {
      const t = tools.addTask(text, due)
      return { message: t.due ? `Task added · reminder set` : 'Task added', hide: false }
    },
    'time.track'({ project }) {
      tools.time.start(project)
      tools.onTrackingChange()
      return { message: `Tracking “${project}”` }
    },
    'time.stop'() {
      const e = tools.time.stop()
      tools.onTrackingChange()
      if (!e) return { message: 'Nothing was being tracked' }
      const mins = Math.round((e.endedAt - e.startedAt) / 60_000)
      return {
        message: `Stopped “${e.project}” · ${mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`}`
      }
    },
    async 'note.send'({ target, text }) {
      return { message: await tools.capture.send(target, text), hide: false }
    }
  }

  return {
    has: (id) => id in executors,
    run: (id, params) => executors[id](params)
  }
}
