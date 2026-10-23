import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { openDb } from '../src/main/db/index.js'
import { snippetsRepo } from '../src/main/db/features.js'
import { notesRepo } from '../src/main/db/notes.js'
import { quicklinksRepo, tasksRepo, timeRepo } from '../src/main/db/productivity.js'
import { createSettingsStore } from '../src/main/settingsStore.js'
import { createQuickCapture } from '../src/main/tools/capture.js'
import { contactUrl } from '../src/main/tools/contacts.js'
import { buildInsights } from '../src/main/tools/insights.js'
import { listPorts, parseLsof } from '../src/main/tools/ports.js'
import { createProjects } from '../src/main/tools/projects.js'
import { createScripts, parseScriptMeta } from '../src/main/tools/scripts.js'
import { createShortcutsService } from '../src/main/tools/shortcuts.js'
import { applyImport, collectExport, decodeExport, encodeExport } from '../src/main/tools/sync.js'
import { runSystemCommand } from '../src/main/tools/system.js'
import { DEFAULT_SETTINGS } from '../src/shared/settings.js'

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cast-tools-'))

describe('ports', () => {
  it('parses lsof field output', () => {
    const out = 'p123\ncnode\nn*:3000\nn127.0.0.1:3000\np456\ncpostgres\nn127.0.0.1:5432\n'
    expect(parseLsof(out)).toEqual([
      { pid: 123, command: 'node', port: 3000, address: 'all interfaces' },
      { pid: 456, command: 'postgres', port: 5432, address: '127.0.0.1' }
    ])
  })
  it('really lists listening ports on this Mac', async () => {
    const ports = await listPorts()
    expect(Array.isArray(ports)).toBe(true)
    for (const p of ports)
      expect(p).toMatchObject({ pid: expect.any(Number), port: expect.any(Number) })
  })
})

describe('system commands', () => {
  it('requires confirmation for destructive commands and rejects unknown ones', async () => {
    await expect(runSystemCommand({ command: 'shutdown' })).rejects.toMatchObject({
      code: 'CONFIRM'
    })
    await expect(runSystemCommand({ command: 'emptytrash' })).rejects.toMatchObject({
      code: 'CONFIRM'
    })
    await expect(runSystemCommand({ command: 'rm -rf' })).rejects.toMatchObject({ code: 'INVALID' })
    await expect(runSystemCommand({ command: 'volume', level: 400 })).rejects.toMatchObject({
      code: 'INVALID'
    })
  })
})

describe('scripts', () => {
  it('reads metadata', () => {
    expect(
      parseScriptMeta('#!/bin/sh\n# @cast.title Deploy\n# @cast.mode copy\n', 'deploy.sh')
    ).toMatchObject({ title: 'Deploy', mode: 'copy' })
    expect(parseScriptMeta('echo', 'x.sh')).toMatchObject({ title: 'x', mode: 'output' })
  })
  it('creates the folder with an example, lists only executables in it, runs with an argument', async () => {
    const dir = path.join(tmp(), 'Scripts')
    const settings = { scriptsEnabled: true, scriptsFolder: dir }
    const sc = createScripts({ getSettings: () => settings })
    expect(sc.list().map((s) => s.title)).toEqual(['Hello from Cast'])
    fs.writeFileSync(path.join(dir, 'notexec.sh'), '#!/bin/sh\necho no')
    const outside = path.join(tmp(), 'evil.sh')
    fs.writeFileSync(outside, '#!/bin/sh\necho evil', { mode: 0o755 })
    fs.symlinkSync(outside, path.join(dir, 'link.sh'))
    expect(sc.list().map((s) => s.id)).toEqual(['hello.sh'])
    const r = await sc.run('hello.sh', 'Aryan')
    expect(r.output).toMatch(/^Hello, Aryan! It's /)
    fs.writeFileSync(path.join(dir, 'fail.sh'), '#!/bin/sh\necho boom >&2\nexit 3', { mode: 0o755 })
    await expect(sc.run('fail.sh')).rejects.toMatchObject({
      code: 'FAILED',
      message: expect.stringMatching(/boom/)
    })
    settings.scriptsEnabled = false
    expect(sc.list()).toEqual([])
    await expect(sc.run('hello.sh')).rejects.toMatchObject({ code: 'DISABLED' })
  })
})

describe('projects', () => {
  it('finds git repos up to depth 3, skipping node_modules, and searches them', () => {
    const root = tmp()
    for (const p of ['a/cast-desktop', 'b/c/d/too-deep/x', 'web/node_modules/pkg', 'web/site'])
      fs.mkdirSync(path.join(root, p), { recursive: true })
    fs.mkdirSync(path.join(root, 'a/cast-desktop/.git'))
    fs.writeFileSync(path.join(root, 'a/cast-desktop/.git/HEAD'), 'ref: refs/heads/main\n')
    fs.mkdirSync(path.join(root, 'web/site/.git'))
    fs.mkdirSync(path.join(root, 'web/node_modules/pkg/.git'))
    fs.mkdirSync(path.join(root, 'b/c/d/too-deep/x/.git'), { recursive: true })
    const pr = createProjects({ getSettings: () => ({ projectFolders: [root] }) })
    expect(
      pr
        .list()
        .map((p) => p.name)
        .sort()
    ).toEqual(['cast-desktop', 'site'])
    expect(pr.search('cast')[0]).toMatchObject({ name: 'cast-desktop', branch: 'main' })
  })
})

describe('contacts + shortcuts', () => {
  it('builds safe URLs per channel', () => {
    expect(contactUrl('call', '+1 (555) 010-9999')).toBe('tel:+15550109999')
    expect(contactUrl('facetime', '+91 98765 43210')).toBe('facetime:+919876543210')
    expect(contactUrl('message', '555-0100')).toBe('sms:5550100')
    expect(contactUrl('email', 'jane@x.com')).toBe('mailto:jane@x.com')
    expect(contactUrl('call', 'no digits')).toBeNull()
  })
  it('lists real Shortcuts without throwing', async () => {
    const names = await createShortcutsService().list()
    expect(Array.isArray(names)).toBe(true)
  })
})

describe('quick capture', () => {
  it('appends to an Obsidian inbox note, creating it once', async () => {
    const vault = tmp()
    const qc = createQuickCapture({
      getSettings: () => ({ obsidianVault: vault, obsidianInboxNote: 'Inbox' }),
      secrets: { get: () => null },
      now: () => new Date(2026, 9, 22, 9, 5)
    })
    await qc.send('obsidian', 'first idea')
    await qc.send('obsidian', 'second\nline')
    expect(fs.readFileSync(path.join(vault, 'Inbox.md'), 'utf8')).toBe(
      '- 2026-10-22 09:05 first idea\n\n- 2026-10-22 09:05 second\n  line\n'
    )
  })
  it('explains missing configuration', async () => {
    const qc = createQuickCapture({ getSettings: () => ({}), secrets: { get: () => null } })
    await expect(qc.send('obsidian', 'x')).rejects.toMatchObject({ code: 'NOT_CONFIGURED' })
    await expect(qc.send('notion', 'x')).rejects.toMatchObject({ code: 'NOT_CONFIGURED' })
    await expect(qc.send('obsidian', '  ')).rejects.toMatchObject({ code: 'INVALID' })
  })
  it('posts a paragraph block to Notion', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    const qc = createQuickCapture({
      getSettings: () => ({
        notionPageId: 'https://www.notion.so/Inbox-0123456789abcdef0123456789abcdef'
      }),
      secrets: { get: () => 'secret_x' },
      fetch
    })
    await qc.send('notion', 'hello')
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://api.notion.com/v1/blocks/0123456789abcdef0123456789abcdef/children')
    expect(init.headers.Authorization).toBe('Bearer secret_x')
    expect(JSON.parse(init.body).children[0].paragraph.rich_text[0].text.content).toBe('hello')
  })
})

describe('export / import', () => {
  const world = () => {
    const db = openDb()
    return {
      db,
      settings: createSettingsStore({ db }),
      notes: notesRepo(db),
      snippets: snippetsRepo(db),
      quicklinks: quicklinksRepo(db),
      tasks: tasksRepo(db)
    }
  }
  it('round-trips through an encrypted file and merges without duplicates', () => {
    const a = world()
    a.settings.set('searchEngine', 'brave')
    a.notes.create({ title: 'T', body: 'hello' })
    a.snippets.create({ name: 'sig', body: 'Best' })
    a.quicklinks.create({ keyword: 'jira', name: 'Jira', url: 'https://x/{query}' })
    a.tasks.create({ text: 'ship it', due: 123 })
    const file = encodeExport(collectExport(a), 'correct horse')
    expect(file).not.toContain('hello')
    expect(() => decodeExport(file)).toThrow(/encrypted/)
    expect(() => decodeExport(file, 'wrong')).toThrow(/Wrong passphrase/)

    const b = world()
    b.snippets.create({ name: 'SIG', body: 'mine' })
    const data = decodeExport(file, 'correct horse')
    const setSetting = (k, v) => b.settings.set(k, v)
    const counts = applyImport(data, { ...b, setSetting })
    expect(counts).toMatchObject({ notes: 1, snippets: 0, quicklinks: 1, tasks: 1 })
    expect(b.settings.get('searchEngine')).toBe('brave')
    expect(b.snippets.search('sig')[0].body).toBe('mine') // existing kept
    expect(applyImport(data, { ...b, setSetting })).toMatchObject({
      notes: 0,
      quicklinks: 0,
      tasks: 0
    }) // idempotent
  })
  it('rejects foreign files and never exports secrets', () => {
    expect(() => decodeExport('{"a":1}')).toThrow(/isn’t a Cast export/)
    expect(() => decodeExport('nope')).toThrow(/isn’t a Cast export/)
    const w = world()
    const data = collectExport(w)
    expect(JSON.stringify(data)).not.toMatch(/apiKey|token|secret/i)
    expect(data.settings).not.toHaveProperty('onboarded')
  })
})

describe('insights', () => {
  it('summarises the last 7 days', () => {
    const db = openDb()
    const now = Date.UTC(2026, 9, 22, 12)
    const ins = db.prepare(
      'INSERT INTO action_history(action_id, summary, used_at) VALUES(?, ?, ?)'
    )
    ins.run('timer.start', 't', now - 1000)
    ins.run('timer.start', 't', now - 86_400_000 - 1000)
    ins.run('note.create', 'n', now - 1000)
    ins.run('note.create', 'n', now - 30 * 86_400_000) // too old
    const tasks = tasksRepo(db)
    tasks.update(tasks.create({ text: 'x' }).id, { doneAt: now - 1000 })
    const time = timeRepo(db)
    time.start('cast', now - 3_600_000)
    const r = buildInsights({ db, tasks, time, now })
    expect(r.total).toBe(3)
    expect(r.top[0]).toMatchObject({ id: 'timer.start', count: 2, title: 'Start timer' })
    expect(r.byDay.at(-1)).toBe(2)
    expect(r.tasksDone).toBe(1)
    expect(r.tracked).toEqual([{ project: 'cast', ms: 3_600_000 }])
    expect(DEFAULT_SETTINGS).toBeTruthy()
  })
})
