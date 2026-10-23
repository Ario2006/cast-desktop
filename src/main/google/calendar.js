import crypto from 'node:crypto'
import { meetingLink } from '../../shared/commands.js'
import { GoogleAuthError } from './oauth.js'

const API = 'https://www.googleapis.com/calendar/v3'

export class CalendarError extends Error {
  /** @param {'reconnect'|'offline'|'quota'|'not_found'|'api'} code */
  constructor(code, message) {
    super(message)
    this.name = 'CalendarError'
    this.code = code
  }
}

/** Thin Google Calendar REST client (calendarList.list, events.insert/delete/list). */
export function createCalendarClient({ auth, fetch = globalThis.fetch }) {
  async function call(method, path, { query, body } = {}) {
    let token
    try {
      token = await auth.getAccessToken()
    } catch (e) {
      if (e instanceof GoogleAuthError)
        throw new CalendarError(e.code === 'offline' ? 'offline' : 'reconnect', e.message)
      throw e
    }
    const url = new URL(`${API}${path}`)
    for (const [k, v] of Object.entries(query ?? {}))
      if (v !== undefined) url.searchParams.set(k, String(v))
    let res
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        body: body ? JSON.stringify(body) : undefined
      })
    } catch {
      throw new CalendarError('offline', 'You appear to be offline')
    }
    if (res.status === 204) return null
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = json?.error?.message || `HTTP ${res.status}`
      if (res.status === 401) throw new CalendarError('reconnect', 'Google session expired')
      if (res.status === 404 || res.status === 410) throw new CalendarError('not_found', msg)
      if (res.status === 403 && /rate|quota/i.test(JSON.stringify(json)))
        throw new CalendarError('quota', msg)
      if (res.status === 429)
        throw new CalendarError('quota', 'Google Calendar quota exceeded — try again shortly')
      throw new CalendarError('api', msg)
    }
    return json
  }

  const enc = encodeURIComponent

  return {
    async listCalendars({ minAccessRole = 'writer' } = {}) {
      const r = await call('GET', '/users/me/calendarList', { query: { minAccessRole } })
      return (r.items ?? []).map((c) => ({
        id: c.id,
        name: c.summaryOverride || c.summary,
        primary: Boolean(c.primary),
        color: c.backgroundColor
      }))
    },

    /** Events overlapping [start, end) — used for the conflict warning. */
    async listEvents({ calendarId = 'primary', start, end }) {
      const r = await call('GET', `/calendars/${enc(calendarId)}/events`, {
        query: {
          timeMin: start,
          timeMax: end,
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 10
        }
      })
      return (r.items ?? [])
        .filter((e) => e.status !== 'cancelled' && e.transparency !== 'transparent')
        .map((e) => ({
          id: e.id,
          title: e.summary || '(no title)',
          start: e.start?.dateTime ?? e.start?.date,
          end: e.end?.dateTime ?? e.end?.date
        }))
    },

    /** Everything happening in [start, end) across the user's calendars, sorted by start. */
    async listAgenda({ start, end, maxCalendars = 8 }) {
      const calendars = (await this.listCalendars({ minAccessRole: 'reader' })).slice(
        0,
        maxCalendars
      )
      const perCal = await Promise.all(
        calendars.map(
          (c) =>
            call('GET', `/calendars/${enc(c.id)}/events`, {
              query: {
                timeMin: start,
                timeMax: end,
                singleEvents: true,
                orderBy: 'startTime',
                maxResults: 25
              }
            })
              .then((r) => (r.items ?? []).map((e) => ({ e, c })))
              .catch(() => []) // one unreadable calendar must not hide the others
        )
      )
      return perCal
        .flat()
        .filter(({ e }) => e.status !== 'cancelled')
        .map(({ e, c }) => ({
          id: e.id,
          title: e.summary || '(no title)',
          start: e.start?.dateTime ?? e.start?.date,
          end: e.end?.dateTime ?? e.end?.date,
          allDay: Boolean(e.start?.date && !e.start?.dateTime),
          location: e.location || undefined,
          htmlLink: e.htmlLink,
          link: meetingLink(e),
          calendar: c.name,
          color: c.color
        }))
        .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
    },

    /** The meeting with a video link that is happening now or starts next today (or null). */
    async nextMeeting(now = Date.now()) {
      const from = new Date(now - 60 * 60_000).toISOString()
      const to = new Date(now + 12 * 3_600_000).toISOString()
      const events = await this.listAgenda({ start: from, end: to })
      return (
        events.find(
          (e) =>
            !e.allDay &&
            e.link &&
            Date.parse(e.end) > now &&
            Date.parse(e.start) - now < 12 * 3_600_000
        ) ?? null
      )
    },

    async insertEvent({
      calendarId = 'primary',
      title,
      start,
      end,
      timeZone,
      location,
      description,
      attendees,
      addMeetLink,
      recurrence
    }) {
      const event = {
        ...(recurrence ? { recurrence: [recurrence] } : {}),
        summary: title,
        start: { dateTime: start, timeZone },
        end: { dateTime: end, timeZone },
        ...(location ? { location } : {}),
        ...(description ? { description } : {}),
        ...(attendees?.length ? { attendees: attendees.map((email) => ({ email })) } : {}),
        ...(addMeetLink
          ? {
              conferenceData: {
                createRequest: {
                  requestId: crypto.randomUUID(),
                  conferenceSolutionKey: { type: 'hangoutsMeet' }
                }
              }
            }
          : {})
      }
      const r = await call('POST', `/calendars/${enc(calendarId)}/events`, {
        query: {
          conferenceDataVersion: addMeetLink ? 1 : undefined,
          sendUpdates: attendees?.length ? 'all' : 'none'
        },
        body: event
      })
      return { id: r.id, calendarId, htmlLink: r.htmlLink, meetLink: r.hangoutLink }
    },

    async deleteEvent({ calendarId = 'primary', eventId }) {
      await call('DELETE', `/calendars/${enc(calendarId)}/events/${enc(eventId)}`, {
        query: { sendUpdates: 'none' }
      })
    }
  }
}
