import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Fuse from 'fuse.js'
import { fail, run } from './exec.js'

const expand = (p) => (p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p)
const SKIP = new Set([
  'node_modules',
  'Library',
  'Applications',
  '.Trash',
  'vendor',
  'dist',
  'build',
  'out',
  'Pods'
])

export const EDITORS = {
  vscode: { name: 'Visual Studio Code', app: 'Visual Studio Code' },
  cursor: { name: 'Cursor', app: 'Cursor' },
  zed: { name: 'Zed', app: 'Zed' },
  sublime: { name: 'Sublime Text', app: 'Sublime Text' },
  webstorm: { name: 'WebStorm', app: 'WebStorm' },
  xcode: { name: 'Xcode', app: 'Xcode' },
  finder: { name: 'Finder', app: 'Finder' }
}
export const TERMINALS = { terminal: 'Terminal', iterm: 'iTerm', warp: 'Warp', ghostty: 'Ghostty' }

function branchOf(dir) {
  try {
    const head = fs.readFileSync(path.join(dir, '.git', 'HEAD'), 'utf8').trim()
    return head.startsWith('ref: refs/heads/') ? head.slice(16) : head.slice(0, 7)
  } catch {
    return null
  }
}

/** Finds git repositories under the configured folders (depth ≤ 3) and opens them in your editor. */
export function createProjects({ getSettings, now = Date.now }) {
  let cache = { at: 0, key: '', items: [] }

  function scan(folders) {
    const found = []
    const walk = (dir, depth) => {
      if (found.length > 500) return
      let entries
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch {
        return
      }
      if (entries.some((e) => e.name === '.git')) {
        found.push({ path: dir, name: path.basename(dir) })
        return // don't descend into a repo
      }
      if (depth >= 3) return
      for (const e of entries) {
        if (e.isDirectory() && !e.name.startsWith('.') && !SKIP.has(e.name))
          walk(path.join(dir, e.name), depth + 1)
      }
    }
    for (const f of folders) walk(expand(f), 0)
    return found
  }

  function list() {
    const folders = getSettings().projectFolders
    const key = folders.join('|')
    if (cache.key !== key || now() - cache.at > 5 * 60_000)
      cache = { at: now(), key, items: scan(folders) }
    return cache.items
  }

  return {
    list,
    search(query, limit = 5) {
      const items = list()
      const hits = query
        ? new Fuse(items, {
            keys: ['name'],
            threshold: 0.25,
            ignoreLocation: true,
            minMatchCharLength: 3
          })
            .search(query, { limit })
            .map((r) => r.item)
        : items.slice(0, limit)
      return hits.map((p) => ({
        ...p,
        branch: branchOf(p.path),
        display: p.path.replace(os.homedir(), '~')
      }))
    },
    async open(projectPath, target = 'editor') {
      const real = fs.realpathSync(projectPath)
      if (!list().some((p) => fs.realpathSync(p.path) === real))
        throw fail('NOT_FOUND', 'Not a known project')
      const s = getSettings()
      const app = target === 'terminal' ? TERMINALS[s.terminalApp] : EDITORS[s.projectEditor]?.app
      try {
        await run('open', ['-a', app, real])
      } catch {
        throw fail(
          'NOT_INSTALLED',
          `${app} isn’t installed — choose another app in Settings → Developer`
        )
      }
    },
    invalidate: () => (cache.at = 0)
  }
}
