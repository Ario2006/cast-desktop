import { IPC } from '../../shared/constants.js'
import * as s from '../../shared/validate.js'
import { searchApps, searchFiles } from '../actions/files.js'

const firstLine = (t) =>
  (t ?? '')
    .split('\n')
    .find((l) => l.trim())
    ?.trim()
    .slice(0, 80) ?? 'Untitled'

export function registerSuggest({ handle, on }, ctx) {
  handle(IPC.suggestAi, s.obj({ input: s.str(500), requestId: s.str(64, 1) }), (p) =>
    ctx.ai.classify({
      requestId: p.requestId,
      input: p.input,
      recording: ctx.recorder.isRecording()
    })
  )
  on(IPC.suggestCancel, s.obj({ requestId: s.str(64, 1) }), ({ requestId }) =>
    ctx.ai.cancel(requestId)
  )

  handle(IPC.suggestFiles, s.obj({ query: s.str(100) }), async ({ query }) => {
    const [files, apps] = await Promise.all([searchFiles(query), searchApps(query)])
    return { files, apps }
  })

  handle(IPC.suggestNotes, s.obj({ query: s.str(200) }), ({ query }) =>
    ctx.notes
      .search(query, 3)
      .map((n) => ({ id: n.id, title: n.title || firstLine(n.body), snippet: firstLine(n.body) }))
  )

  // Action history (powers recents + ranking). Only the chosen action is stored, never keystrokes.
  handle(IPC.historyStats, null, () => (ctx.settings.get('keepHistory') ? ctx.history.stats() : {}))
  handle(IPC.historyRecent, null, () =>
    ctx.settings.get('keepHistory') ? ctx.history.recent(5) : []
  )
  handle(IPC.historyRecord, s.obj({ actionId: s.str(60, 1), summary: s.opt(s.str(120)) }), (p) => {
    if (ctx.settings.get('keepHistory')) ctx.history.record(p.actionId, p.summary)
  })
  handle(IPC.historyClear, null, () => ctx.history.clear())
}
