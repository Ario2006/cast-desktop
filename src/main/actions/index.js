import fs from 'node:fs'
import path from 'node:path'
import { clipboard, shell } from 'electron'
import { convertUnits, evaluateMath } from '../../shared/calc.js'
import { normalizeUrl } from '../../shared/search.js'
import { searchUrlFor } from '../../shared/suggest.js'
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
export function createActionRunner({ getSettings, screenshot, recorder }) {
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
    }
  }

  return {
    has: (id) => id in executors,
    run: (id, params) => executors[id](params)
  }
}
