import { IPC } from '../../shared/constants.js'
import * as s from '../../shared/validate.js'

const nf = () => Object.assign(new Error('Note not found'), { code: 'NOT_FOUND' })

export function registerNotes({ handle }, ctx) {
  handle(IPC.notesCreate, s.obj({ title: s.opt(s.str(200)), body: s.str(100_000) }), (p) =>
    ctx.notes.create(p)
  )
  handle(
    IPC.notesUpdate,
    s.obj({
      id: s.int(1),
      title: s.opt(s.str(200)),
      body: s.opt(s.str(100_000)),
      pinned: s.opt(s.bool)
    }),
    ({ id, ...fields }) =>
      ctx.notes.update(id, fields) ??
      (() => {
        throw nf()
      })()
  )
  handle(
    IPC.notesGet,
    s.obj({ id: s.int(1) }),
    ({ id }) =>
      ctx.notes.get(id) ??
      (() => {
        throw nf()
      })()
  )
  handle(IPC.notesDelete, s.obj({ id: s.int(1) }), ({ id }) => ctx.notes.delete(id))
  handle(
    IPC.notesSearch,
    s.obj({ query: s.str(200), limit: s.opt(s.int(1, 50)) }),
    ({ query, limit }) => ctx.notes.search(query, limit ?? 20)
  )
  handle(IPC.notesClear, null, () => ctx.notes.clear())
}
