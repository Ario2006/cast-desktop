import crypto from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { CalendarError, createCalendarClient } from '../src/main/google/calendar.js'
import {
  buildAuthUrl,
  createGoogleAuth,
  createPkce,
  GoogleAuthError,
  SCOPES
} from '../src/main/google/oauth.js'

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const memSecrets = () => {
  const m = new Map()
  return {
    get: (k) => m.get(k) ?? null,
    set: (k, v) => m.set(k, v),
    delete: (k) => m.delete(k),
    has: (k) => m.has(k),
    _m: m
  }
}

describe('PKCE + auth URL', () => {
  it('challenge is base64url(sha256(verifier))', () => {
    const { verifier, challenge } = createPkce()
    expect(verifier.length).toBeGreaterThanOrEqual(43)
    expect(challenge).toBe(crypto.createHash('sha256').update(verifier).digest('base64url'))
    expect(createPkce().verifier).not.toBe(verifier)
  })

  it('auth URL carries PKCE, loopback redirect, offline access and the spec scopes', () => {
    const u = new URL(
      buildAuthUrl({
        clientId: 'cid',
        redirectUri: 'http://127.0.0.1:5555',
        challenge: 'ch',
        state: 'st'
      })
    )
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      client_id: 'cid',
      redirect_uri: 'http://127.0.0.1:5555',
      response_type: 'code',
      code_challenge: 'ch',
      code_challenge_method: 'S256',
      state: 'st',
      access_type: 'offline'
    })
    expect(u.searchParams.get('scope')).toContain('https://www.googleapis.com/auth/calendar.events')
    expect(SCOPES).toContain('https://www.googleapis.com/auth/calendar.readonly')
  })
})

describe('Google auth flow', () => {
  it('runs the full loopback flow: browser redirect → code → token exchange → encrypted storage', async () => {
    const secrets = memSecrets()
    const fetch = vi
      .fn()
      .mockResolvedValue(json({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 }))
    let authUrl
    const auth = createGoogleAuth({
      secrets,
      getClientId: () => 'client-id',
      fetch,
      // play the browser: open the consent URL, then hit the loopback redirect with a code
      openExternal: async (url) => {
        authUrl = new URL(url)
        const redirect = new URL(authUrl.searchParams.get('redirect_uri'))
        redirect.searchParams.set('code', 'the-code')
        redirect.searchParams.set('state', authUrl.searchParams.get('state'))
        setTimeout(() => globalThis.fetch(redirect).catch(() => {}), 20)
      }
    })
    expect(auth.isConnected()).toBe(false)
    await auth.connect({ timeoutMs: 5000 })
    expect(auth.isConnected()).toBe(true)

    const [, init] = fetch.mock.calls[0]
    const body = new URLSearchParams(init.body)
    expect(body.get('code')).toBe('the-code')
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('redirect_uri')).toBe(authUrl.searchParams.get('redirect_uri'))
    // PKCE: the verifier sent to the token endpoint must hash to the challenge sent to Google
    expect(crypto.createHash('sha256').update(body.get('code_verifier')).digest('base64url')).toBe(
      authUrl.searchParams.get('code_challenge')
    )
    expect(JSON.parse(secrets.get('googleTokens'))).toMatchObject({
      access_token: 'at',
      refresh_token: 'rt'
    })
  })

  it('rejects a redirect with the wrong state (CSRF) and a denied consent', async () => {
    const mk = (params) =>
      createGoogleAuth({
        secrets: memSecrets(),
        getClientId: () => 'cid',
        fetch: vi.fn(),
        openExternal: async (url) => {
          const redirect = new URL(new URL(url).searchParams.get('redirect_uri'))
          for (const [k, v] of Object.entries(params)) redirect.searchParams.set(k, v)
          setTimeout(() => globalThis.fetch(redirect).catch(() => {}), 20)
        }
      })
    await expect(
      mk({ code: 'x', state: 'WRONG' }).connect({ timeoutMs: 3000 })
    ).rejects.toMatchObject({ code: 'failed' })
    await expect(mk({ error: 'access_denied' }).connect({ timeoutMs: 3000 })).rejects.toMatchObject(
      { code: 'denied' }
    )
  })

  it('times out when the user never finishes', async () => {
    const auth = createGoogleAuth({
      secrets: memSecrets(),
      getClientId: () => 'cid',
      fetch: vi.fn(),
      openExternal: async () => {}
    })
    await expect(auth.connect({ timeoutMs: 100 })).rejects.toMatchObject({ code: 'timeout' })
  })

  it('requires a client id', async () => {
    const auth = createGoogleAuth({
      secrets: memSecrets(),
      getClientId: () => '',
      fetch: vi.fn(),
      openExternal: vi.fn()
    })
    expect(auth.isConfigured()).toBe(false)
    await expect(auth.connect()).rejects.toMatchObject({ code: 'not_configured' })
  })

  it('refreshes expired access tokens and keeps the refresh token', async () => {
    let now = 1_000_000
    const secrets = memSecrets()
    secrets.set(
      'googleTokens',
      JSON.stringify({ access_token: 'old', refresh_token: 'rt', expires_at: now + 10_000 })
    )
    const fetch = vi.fn().mockResolvedValue(json({ access_token: 'new', expires_in: 3600 }))
    const auth = createGoogleAuth({
      secrets,
      getClientId: () => 'cid',
      fetch,
      openExternal: vi.fn(),
      now: () => now
    })
    expect(await auth.getAccessToken()).toBe('new') // <60 s left → refresh
    expect(new URLSearchParams(fetch.mock.calls[0][1].body).get('grant_type')).toBe('refresh_token')
    expect(JSON.parse(secrets.get('googleTokens')).refresh_token).toBe('rt')
    now += 1000
    expect(await auth.getAccessToken()).toBe('new')
    expect(fetch).toHaveBeenCalledTimes(1) // cached
  })

  it('invalid_grant clears the tokens and asks to reconnect', async () => {
    const secrets = memSecrets()
    secrets.set(
      'googleTokens',
      JSON.stringify({ access_token: 'x', refresh_token: 'rt', expires_at: 0 })
    )
    const auth = createGoogleAuth({
      secrets,
      getClientId: () => 'cid',
      fetch: vi.fn().mockResolvedValue(json({ error: 'invalid_grant' }, 400)),
      openExternal: vi.fn()
    })
    await expect(auth.getAccessToken()).rejects.toMatchObject({ code: 'reconnect' })
    expect(auth.isConnected()).toBe(false)
  })

  it('offline refresh keeps the tokens', async () => {
    const secrets = memSecrets()
    secrets.set(
      'googleTokens',
      JSON.stringify({ access_token: 'x', refresh_token: 'rt', expires_at: 0 })
    )
    const auth = createGoogleAuth({
      secrets,
      getClientId: () => 'cid',
      fetch: vi.fn().mockRejectedValue(new Error('net')),
      openExternal: vi.fn()
    })
    await expect(auth.getAccessToken()).rejects.toBeInstanceOf(GoogleAuthError)
    expect(auth.isConnected()).toBe(true)
  })
})

describe('Calendar client', () => {
  const auth = { getAccessToken: async () => 'tok' }
  const client = (fetch) => createCalendarClient({ auth, fetch })

  it('inserts events with timezone, attendees and a Meet request', async () => {
    const fetch = vi.fn().mockResolvedValue(
      json({
        id: 'ev1',
        htmlLink: 'https://www.google.com/calendar/event?eid=1',
        hangoutLink: 'https://meet.google.com/abc'
      })
    )
    const r = await client(fetch).insertEvent({
      title: 'Dentist',
      start: '2026-10-23T09:30:00.000Z',
      end: '2026-10-23T10:30:00.000Z',
      timeZone: 'Asia/Kolkata',
      attendees: ['a@b.com'],
      addMeetLink: true
    })
    expect(r).toMatchObject({
      id: 'ev1',
      htmlLink: expect.stringContaining('google.com'),
      meetLink: 'https://meet.google.com/abc'
    })
    const [url, init] = fetch.mock.calls[0]
    expect(url.toString()).toContain('/calendars/primary/events')
    expect(url.searchParams.get('conferenceDataVersion')).toBe('1')
    expect(init.headers.Authorization).toBe('Bearer tok')
    const body = JSON.parse(init.body)
    expect(body).toMatchObject({
      summary: 'Dentist',
      start: { timeZone: 'Asia/Kolkata' },
      attendees: [{ email: 'a@b.com' }]
    })
    expect(body.conferenceData.createRequest.conferenceSolutionKey.type).toBe('hangoutsMeet')
  })

  it('encodes calendar ids and deletes events (undo)', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    await client(fetch).deleteEvent({ calendarId: 'a@group.calendar.google.com', eventId: 'ev/1' })
    const [url, init] = fetch.mock.calls[0]
    expect(init.method).toBe('DELETE')
    expect(url.pathname).toContain('a%40group.calendar.google.com/events/ev%2F1')
  })

  it('lists calendars and conflicting events (ignores cancelled / free ones)', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          items: [
            { id: 'p', summary: 'Me', primary: true },
            { id: 'w', summary: 'Work', summaryOverride: 'Work!' }
          ]
        })
      )
      .mockResolvedValueOnce(
        json({
          items: [
            { id: '1', summary: 'Standup', start: { dateTime: 'a' }, end: { dateTime: 'b' } },
            { id: '2', status: 'cancelled' },
            { id: '3', transparency: 'transparent', summary: 'FYI' }
          ]
        })
      )
    const c = client(fetch)
    expect((await c.listCalendars()).map((x) => x.name)).toEqual(['Me', 'Work!'])
    expect(await c.listEvents({ start: 'a', end: 'b' })).toEqual([
      { id: '1', title: 'Standup', start: 'a', end: 'b' }
    ])
  })

  it('maps failures to actionable codes', async () => {
    const call = (r) => client(vi.fn().mockResolvedValue(r)).listCalendars()
    await expect(call(json({}, 401))).rejects.toMatchObject({ code: 'reconnect' })
    await expect(
      call(json({ error: { message: 'Rate Limit Exceeded' } }, 403))
    ).rejects.toMatchObject({ code: 'quota' })
    await expect(call(json({}, 429))).rejects.toMatchObject({ code: 'quota' })
    await expect(call(json({}, 404))).rejects.toMatchObject({ code: 'not_found' })
    await expect(call(json({ error: { message: 'boom' } }, 500))).rejects.toMatchObject({
      code: 'api',
      message: 'boom'
    })
    await expect(
      client(vi.fn().mockRejectedValue(new Error('net'))).listCalendars()
    ).rejects.toMatchObject({ code: 'offline' })
    const expired = createCalendarClient({
      auth: {
        getAccessToken: async () => {
          throw new GoogleAuthError('reconnect', 'expired')
        }
      },
      fetch: vi.fn()
    })
    await expect(expired.listCalendars()).rejects.toBeInstanceOf(CalendarError)
    await expect(expired.listCalendars()).rejects.toMatchObject({ code: 'reconnect' })
  })
})
