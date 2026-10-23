import crypto from 'node:crypto'
import { SETTING_KEYS, validateSetting } from '../../shared/settings.js'
import { fail } from './exec.js'

const FORMAT = 'cast-export'
const VERSION = 1
// settings that describe this machine rather than the user's preferences
const LOCAL_ONLY = new Set(['onboarded', 'launchAtLogin'])

/** Collect everything worth moving to another Mac. Secrets (API keys, tokens) are never included. */
export function collectExport({ settings, notes, snippets, quicklinks, tasks }) {
  const s = settings.all()
  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    settings: Object.fromEntries(
      SETTING_KEYS.filter((k) => !LOCAL_ONLY.has(k)).map((k) => [k, s[k]])
    ),
    notes: notes.recent(100_000).map(({ title, body, pinned, createdAt, updatedAt }) => ({
      title,
      body,
      pinned,
      createdAt,
      updatedAt
    })),
    snippets: snippets.search('', 100_000).map(({ name, body }) => ({ name, body })),
    quicklinks: quicklinks.list().map(({ keyword, name, url }) => ({ keyword, name, url })),
    tasks: tasks.all().map(({ text, due, doneAt, createdAt }) => ({ text, due, doneAt, createdAt }))
  }
}

/** AES-256-GCM with a scrypt-derived key; passphrase optional (plain JSON without one). */
export function encodeExport(data, passphrase) {
  const json = JSON.stringify(data)
  if (!passphrase) return json
  const salt = crypto.randomBytes(16)
  const iv = crypto.randomBytes(12)
  const key = crypto.scryptSync(passphrase, salt, 32, {
    N: 2 ** 15,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024
  })
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()])
  return JSON.stringify({
    format: FORMAT,
    version: VERSION,
    encrypted: {
      kdf: 'scrypt',
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: ct.toString('base64')
    }
  })
}

export function decodeExport(text, passphrase) {
  let outer
  try {
    outer = JSON.parse(text)
  } catch {
    throw fail('INVALID', 'That file isn’t a Cast export')
  }
  if (outer?.format !== FORMAT) throw fail('INVALID', 'That file isn’t a Cast export')
  if (outer.version > VERSION) throw fail('INVALID', 'This export is from a newer version of Cast')
  if (!outer.encrypted) return outer
  if (!passphrase) throw fail('PASSPHRASE', 'This export is encrypted — enter its passphrase')
  try {
    const e = outer.encrypted
    const key = crypto.scryptSync(passphrase, Buffer.from(e.salt, 'base64'), 32, {
      N: 2 ** 15,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024
    })
    const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(e.iv, 'base64'))
    d.setAuthTag(Buffer.from(e.tag, 'base64'))
    return JSON.parse(
      Buffer.concat([d.update(Buffer.from(e.data, 'base64')), d.final()]).toString('utf8')
    )
  } catch {
    throw fail('PASSPHRASE', 'Wrong passphrase (or the file is damaged)')
  }
}

/** Merge an export into this Mac's data. Existing items with the same name/keyword are kept. */
export function applyImport(data, { setSetting, notes, snippets, quicklinks, tasks }) {
  const counts = { settings: 0, notes: 0, snippets: 0, quicklinks: 0, tasks: 0, skipped: 0 }
  for (const [k, v] of Object.entries(data.settings ?? {})) {
    if (!SETTING_KEYS.includes(k) || LOCAL_ONLY.has(k)) continue
    try {
      validateSetting(k, v)
      setSetting(k, v)
      counts.settings++
    } catch {
      counts.skipped++
    }
  }
  const existingNotes = new Set(notes.recent(100_000).map((n) => `${n.title ?? ''}\u0000${n.body}`))
  for (const n of data.notes ?? []) {
    if (typeof n?.body !== 'string' || existingNotes.has(`${n.title ?? ''}\u0000${n.body}`))
      continue
    notes.create({
      title: n.title ?? null,
      body: n.body.slice(0, 100_000),
      now: n.createdAt ?? Date.now()
    })
    counts.notes++
  }
  const names = new Set(snippets.search('', 100_000).map((x) => x.name.toLowerCase()))
  for (const s of data.snippets ?? []) {
    if (
      typeof s?.name !== 'string' ||
      typeof s?.body !== 'string' ||
      names.has(s.name.toLowerCase())
    )
      continue
    snippets.create({ name: s.name.slice(0, 40), body: s.body.slice(0, 20_000) })
    names.add(s.name.toLowerCase())
    counts.snippets++
  }
  const keywords = new Set(quicklinks.list().map((q) => q.keyword.toLowerCase()))
  for (const q of data.quicklinks ?? []) {
    if (
      typeof q?.keyword !== 'string' ||
      !/^https?:\/\//i.test(q?.url ?? '') ||
      keywords.has(q.keyword.toLowerCase())
    )
      continue
    quicklinks.create({
      keyword: q.keyword.slice(0, 20),
      name: String(q.name ?? q.keyword).slice(0, 60),
      url: q.url.slice(0, 1000)
    })
    keywords.add(q.keyword.toLowerCase())
    counts.quicklinks++
  }
  const taskKeys = new Set(tasks.all().map((t) => t.text))
  for (const t of data.tasks ?? []) {
    if (typeof t?.text !== 'string' || taskKeys.has(t.text)) continue
    const created = tasks.create({
      text: t.text.slice(0, 500),
      due: Number.isFinite(t.due) ? t.due : null,
      now: t.createdAt ?? Date.now()
    })
    if (Number.isFinite(t.doneAt)) tasks.update(created.id, { doneAt: t.doneAt })
    counts.tasks++
  }
  return counts
}
