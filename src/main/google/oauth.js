import crypto from 'node:crypto'
import http from 'node:http'

export const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly'
]
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SECRET_KEY = 'googleTokens'

export class GoogleAuthError extends Error {
  /** @param {'not_configured'|'reconnect'|'denied'|'timeout'|'offline'|'failed'} code */
  constructor(code, message) {
    super(message)
    this.name = 'GoogleAuthError'
    this.code = code
  }
}

const b64url = (buf) => buf.toString('base64url')

export function createPkce() {
  const verifier = b64url(crypto.randomBytes(64))
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

export function buildAuthUrl({ clientId, redirectUri, challenge, state }) {
  const u = new URL(AUTH_URL)
  u.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    access_type: 'offline',
    prompt: 'consent'
  }).toString()
  return u.toString()
}

const PAGE = (msg) =>
  `<!doctype html><meta charset="utf-8"><title>Cast</title><body style="font:16px -apple-system,system-ui;display:grid;place-items:center;height:100vh;margin:0;background:#16161a;color:#eee"><div style="text-align:center"><h2>Cast</h2><p>${msg}</p></div></body>`

/** Start a one-shot loopback server; resolves { port, code, close } where `code` is a promise. */
function waitForCode({ state, timeoutMs }) {
  return new Promise((resolveStart, rejectStart) => {
    let settle
    const code = new Promise((resolve, reject) => {
      settle = { resolve, reject }
    })
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1')
      if (url.pathname !== '/') {
        res.writeHead(404).end()
        return
      }
      const err = url.searchParams.get('error')
      const authCode = url.searchParams.get('code')
      const okState = url.searchParams.get('state') === state
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      if (err || !authCode || !okState) {
        res.end(PAGE('Authorization was not completed. You can close this tab.'))
        settle.reject(
          new GoogleAuthError(
            err === 'access_denied' ? 'denied' : 'failed',
            err || 'Invalid response'
          )
        )
      } else {
        res.end(PAGE('Connected! You can close this tab and return to Cast.'))
        settle.resolve(authCode)
      }
    })
    const timer = setTimeout(
      () => settle.reject(new GoogleAuthError('timeout', 'Timed out waiting for Google')),
      timeoutMs
    )
    const close = () => {
      clearTimeout(timer)
      server.close()
    }
    code.then(close, close) // always tear the server down once settled
    server.on('error', (e) => rejectStart(new GoogleAuthError('failed', e.message)))
    server.listen(0, '127.0.0.1', () => resolveStart({ port: server.address().port, code, close }))
  })
}

/**
 * Google OAuth for installed apps: system browser + loopback redirect + PKCE.
 * The user supplies their own Desktop-type client ID (and optional client secret).
 */
export function createGoogleAuth({
  secrets,
  getClientId,
  openExternal,
  fetch = globalThis.fetch,
  now = Date.now
}) {
  const clientSecret = () => secrets.get('googleClientSecret') || undefined

  async function tokenRequest(params) {
    const body = new URLSearchParams({ client_id: getClientId(), ...params })
    const secret = clientSecret()
    if (secret) body.set('client_secret', secret)
    let res
    try {
      res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
      })
    } catch {
      throw new GoogleAuthError('offline', 'Could not reach Google')
    }
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (json.error === 'invalid_grant')
        throw new GoogleAuthError('reconnect', 'Google session expired')
      throw new GoogleAuthError(
        'failed',
        json.error_description || json.error || `HTTP ${res.status}`
      )
    }
    return json
  }

  const readTokens = () => {
    const raw = secrets.get(SECRET_KEY)
    try {
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }
  const writeTokens = (t) => secrets.set(SECRET_KEY, JSON.stringify(t))

  return {
    isConnected: () => Boolean(readTokens()?.refresh_token),
    isConfigured: () => Boolean(getClientId()),

    async connect({ timeoutMs = 180_000 } = {}) {
      if (!getClientId())
        throw new GoogleAuthError('not_configured', 'Add your Google OAuth client ID in Settings')
      const { verifier, challenge } = createPkce()
      const state = b64url(crypto.randomBytes(16))
      const server = await waitForCode({ state, timeoutMs })
      const redirectUri = `http://127.0.0.1:${server.port}`
      try {
        await openExternal(buildAuthUrl({ clientId: getClientId(), redirectUri, challenge, state }))
        const code = await server.code
        const tok = await tokenRequest({
          code,
          code_verifier: verifier,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code'
        })
        writeTokens({
          access_token: tok.access_token,
          refresh_token: tok.refresh_token,
          expires_at: now() + (tok.expires_in ?? 3600) * 1000
        })
      } catch (e) {
        server.close()
        throw e
      }
    },

    disconnect() {
      secrets.delete(SECRET_KEY)
    },

    /** Returns a valid access token, refreshing if needed. Throws GoogleAuthError('reconnect'). */
    async getAccessToken() {
      const t = readTokens()
      if (!t?.refresh_token) throw new GoogleAuthError('reconnect', 'Google is not connected')
      if (t.access_token && t.expires_at - now() > 60_000) return t.access_token
      try {
        const tok = await tokenRequest({
          refresh_token: t.refresh_token,
          grant_type: 'refresh_token'
        })
        writeTokens({
          access_token: tok.access_token,
          refresh_token: tok.refresh_token ?? t.refresh_token,
          expires_at: now() + (tok.expires_in ?? 3600) * 1000
        })
        return tok.access_token
      } catch (e) {
        if (e.code === 'reconnect') secrets.delete(SECRET_KEY)
        throw e
      }
    }
  }
}
