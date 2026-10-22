import { IPC, UNDO_WINDOW_MS } from '../../shared/constants.js'
import * as s from '../../shared/validate.js'
import { CalendarError } from '../google/calendar.js'
import { GoogleAuthError } from '../google/oauth.js'

const wrap = (e) => {
  // Surface Google failures with stable codes the widget can act on ("reconnect", "offline"...)
  if (e instanceof CalendarError || e instanceof GoogleAuthError) {
    throw Object.assign(new Error(e.message), { code: e.code.toUpperCase() })
  }
  throw e
}

export function registerCalendar({ handle }, ctx) {
  const created = new Map() // eventId -> createdAt: undo is only honoured inside the window

  handle(IPC.calendarStatus, null, () => ({
    configured: ctx.google.auth.isConfigured(),
    connected: ctx.google.auth.isConnected()
  }))

  handle(IPC.calendarConnect, null, async () => {
    ctx.windows.suppressBlur(190_000) // keep the launcher open while the browser takes focus
    try {
      await ctx.google.auth.connect()
    } catch (e) {
      wrap(e)
    } finally {
      ctx.windows.suppressBlur(0)
      if (!ctx.windows.isVisible()) ctx.windows.show()
    }
    return { connected: true }
  })

  handle(IPC.calendarDisconnect, null, () => ctx.google.auth.disconnect())

  handle(IPC.calendarCalendars, null, () => ctx.google.calendar.listCalendars().catch(wrap))

  handle(
    IPC.calendarConflicts,
    s.obj({ start: s.isoDate, end: s.isoDate, calendarId: s.opt(s.str(300)) }),
    (p) => ctx.google.calendar.listEvents(p).catch(wrap)
  )

  handle(
    IPC.calendarCreate,
    s.obj({
      title: s.str(200, 1),
      start: s.isoDate,
      end: s.isoDate,
      location: s.opt(s.str(300)),
      description: s.opt(s.str(2000)),
      attendees: s.opt(s.arr(s.str(200), 20)),
      calendarId: s.opt(s.str(300)),
      addMeetLink: s.opt(s.bool)
    }),
    async (p) => {
      if (Date.parse(p.end) <= Date.parse(p.start))
        throw Object.assign(new Error('End must be after start'), { code: 'INVALID' })
      const settings = ctx.settings.all()
      const event = await ctx.google.calendar
        .insertEvent({
          ...p,
          calendarId: p.calendarId ?? settings.calendarDefaultId,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        })
        .catch(wrap)
      created.set(event.id, Date.now())
      if (settings.keepHistory)
        ctx.history.record('calendar.create', `Event: ${p.title}`.slice(0, 120))
      return { ...event, undoMs: UNDO_WINDOW_MS }
    }
  )

  handle(
    IPC.calendarUndo,
    s.obj({ eventId: s.str(300, 1), calendarId: s.opt(s.str(300)) }),
    async ({ eventId, calendarId }) => {
      const at = created.get(eventId)
      if (!at || Date.now() - at > UNDO_WINDOW_MS + 5000) {
        throw Object.assign(new Error('Undo window has passed'), { code: 'EXPIRED' })
      }
      await ctx.google.calendar
        .deleteEvent({ calendarId: calendarId ?? ctx.settings.get('calendarDefaultId'), eventId })
        .catch(wrap)
      created.delete(eventId)
      return { undone: true }
    }
  )
}
