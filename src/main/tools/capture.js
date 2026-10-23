import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fail, osascript } from './exec.js'

const expand = (p) => (p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p)
const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Send a quick note to Apple Notes, an Obsidian vault, or a Notion page. */
export function createQuickCapture({
  getSettings,
  secrets,
  fetch = globalThis.fetch,
  now = () => new Date()
}) {
  return {
    async send(target, text) {
      const body = String(text).trim()
      if (!body) throw fail('INVALID', 'Nothing to capture')
      const s = getSettings()
      if (target === 'notes') {
        const html = `<div>${escapeHtml(body).replace(/\n/g, '<br>')}</div>`
        await osascript(
          'on run argv\ntell application "Notes" to make new note with properties {body:item 1 of argv}\nend run',
          [html],
          { permissionFor: 'Notes' }
        )
        return 'Saved to Apple Notes'
      }
      if (target === 'obsidian') {
        if (!s.obsidianVault)
          throw fail('NOT_CONFIGURED', 'Choose your Obsidian vault in Settings → Integrations')
        const vault = expand(s.obsidianVault)
        if (!fs.existsSync(vault))
          throw fail('NOT_FOUND', 'Your Obsidian vault folder no longer exists')
        const file = path.join(vault, `${s.obsidianInboxNote || 'Cast Inbox'}.md`)
        const d = now()
        const stamp = `${d.toISOString().slice(0, 10)} ${d.toTimeString().slice(0, 5)}`
        fs.appendFileSync(
          file,
          `${fs.existsSync(file) ? '\n' : ''}- ${stamp} ${body.replace(/\n/g, '\n  ')}\n`
        )
        return `Added to ${path.basename(file)}`
      }
      if (target === 'notion') {
        const token = secrets.get('notionToken')
        const page = String(s.notionPageId || '')
          .replace(/-/g, '')
          .match(/[0-9a-f]{32}/i)?.[0]
        if (!token || !page)
          throw fail(
            'NOT_CONFIGURED',
            'Add a Notion integration token and page in Settings → Integrations'
          )
        let res
        try {
          res = await fetch(`https://api.notion.com/v1/blocks/${page}/children`, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${token}`,
              'Notion-Version': '2022-06-28',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              children: [
                {
                  object: 'block',
                  type: 'paragraph',
                  paragraph: {
                    rich_text: [{ type: 'text', text: { content: body.slice(0, 2000) } }]
                  }
                }
              ]
            }),
            signal: AbortSignal.timeout(10_000)
          })
        } catch {
          throw fail('OFFLINE', 'Couldn’t reach Notion')
        }
        if (res.status === 401) throw fail('UNAUTHORIZED', 'Notion rejected the token')
        if (res.status === 404)
          throw fail('NOT_FOUND', 'Notion page not found — share it with your integration')
        if (!res.ok) throw fail('FAILED', `Notion returned ${res.status}`)
        return 'Added to Notion'
      }
      throw fail('INVALID', 'Unknown destination')
    }
  }
}
