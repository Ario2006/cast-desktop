import { clipboard } from 'electron'
import { formatMoney } from '../../shared/currency.js'
import { IPC } from '../../shared/constants.js'
import * as s from '../../shared/validate.js'
import fs from 'node:fs'

const notFound = (what) => Object.assign(new Error(`${what} not found`), { code: 'NOT_FOUND' })

/** Handlers for the v1.1 features: learning, Pomodoro, clipboard, snippets, currency, logs. */
export function registerFeatures({ handle }, ctx) {
  // --- learned choices ------------------------------------------------------------------------
  handle(IPC.historyLearned, null, () =>
    ctx.settings.get('learnFromChoices') ? ctx.choices.all() : {}
  )
  handle(
    IPC.historyLearn,
    s.obj({ shape: s.str(24, 1), actionId: s.str(60, 1) }),
    ({ shape, actionId }) => {
      if (ctx.settings.get('learnFromChoices')) ctx.choices.record(shape, actionId)
    }
  )
  handle(IPC.historyClearLearned, null, () => ctx.choices.clear())

  // --- Pomodoro --------------------------------------------------------------------------------
  handle(IPC.pomodoroGet, null, () => ctx.scheduler.getPomodoro())
  handle(IPC.pomodoroStart, null, () => {
    ctx.scheduler.startPomodoro()
    return ctx.scheduler.getPomodoro()
  })
  handle(IPC.pomodoroSkip, null, () => ctx.scheduler.skipPomodoro())
  handle(IPC.pomodoroStop, null, () => ctx.scheduler.stopPomodoro())

  // --- clipboard history (opt-in) --------------------------------------------------------------
  handle(IPC.clipboardList, s.obj({ query: s.opt(s.str(200)) }), ({ query }) => ({
    enabled: ctx.settings.get('clipboardHistory'),
    diag: ctx.clipboardHistory.diag(),
    items: ctx.clipboardHistory
      .list(query ?? '')
      .map((i) => ({ id: i.id, text: i.text.slice(0, 600), at: i.at }))
  }))
  handle(IPC.clipboardCopy, s.obj({ id: s.int(1) }), ({ id }) => {
    if (!ctx.clipboardHistory.copy(id)) throw notFound('Clipboard item')
    ctx.windows.hide()
  })
  handle(IPC.clipboardClear, null, () => ctx.clipboardHistory.clear())

  // --- snippets ----------------------------------------------------------------------------------
  const snippetShape = {
    name: s.str(40, 1),
    body: s.str(20_000, 1)
  }
  const nameClash = (e) =>
    /UNIQUE/i.test(e?.message ?? '')
      ? Object.assign(new Error('A snippet with that name already exists'), { code: 'DUPLICATE' })
      : e
  handle(IPC.snippetsList, s.obj({ query: s.opt(s.str(100)) }), ({ query }) =>
    ctx.snippets.search(query ?? '')
  )
  handle(IPC.snippetsCreate, s.obj(snippetShape), (p) => {
    try {
      return ctx.snippets.create({ name: p.name.trim(), body: p.body })
    } catch (e) {
      throw nameClash(e)
    }
  })
  handle(
    IPC.snippetsUpdate,
    s.obj({ id: s.int(1), name: s.opt(s.str(40, 1)), body: s.opt(s.str(20_000, 1)) }),
    ({ id, ...f }) => {
      try {
        return (
          ctx.snippets.update(id, { ...f, ...(f.name ? { name: f.name.trim() } : {}) }) ??
          (() => {
            throw notFound('Snippet')
          })()
        )
      } catch (e) {
        throw nameClash(e)
      }
    }
  )
  handle(IPC.snippetsDelete, s.obj({ id: s.int(1) }), ({ id }) => ctx.snippets.delete(id))
  handle(IPC.snippetsCopy, s.obj({ id: s.int(1) }), ({ id }) => {
    const snip = ctx.snippets.get(id)
    if (!snip) throw notFound('Snippet')
    clipboard.writeText(snip.body)
    ctx.windows.hide()
    return { name: snip.name }
  })
  handle(IPC.suggestSnippets, s.obj({ query: s.str(100) }), ({ query }) =>
    ctx.snippets
      .search(query, 3)
      .map((x) => ({ id: x.id, name: x.name, preview: x.body.replace(/\s+/g, ' ').slice(0, 80) }))
  )

  // --- currency ----------------------------------------------------------------------------------
  handle(
    IPC.currencyConvert,
    s.obj({ amount: s.num(0, 1e12), from: s.str(3, 3), to: s.str(3, 3) }),
    async ({ amount, from, to }) => {
      const r = await ctx.currency.convert(amount, from.toUpperCase(), to.toUpperCase())
      return { ...r, text: formatMoney(r.value, to.toUpperCase()) }
    }
  )

  // --- logs ------------------------------------------------------------------------------------------
  handle(IPC.appLogs, null, () => {
    try {
      return fs
        .readFileSync(ctx.log.file, 'utf8')
        .split('\n')
        .filter(Boolean)
        .slice(-150)
        .join('\n')
    } catch {
      return ''
    }
  })
}
