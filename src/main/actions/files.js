import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Fuse from 'fuse.js'

const run = (cmd, args, opts = {}) =>
  new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 8 * 1024 * 1024, timeout: 2500, ...opts }, (err, stdout) => {
      if (err && !stdout) reject(err)
      else resolve(String(stdout))
    })
  })

const HOME = os.homedir()
const SKIP = /\/(Library|node_modules|\.[^/]+|Applications\/[^/]+\.app\/)(\/|$)|\.app\/Contents\//

/**
 * File name search through the Spotlight index. The query is passed as a single argv entry to
 * `mdfind -name`, never through a shell, so it cannot be used for command injection.
 */
export async function searchFiles(query, { limit = 5 } = {}) {
  const q = String(query).trim().slice(0, 100)
  if (q.length < 2) return []
  let out = ''
  try {
    out = await run('mdfind', ['-onlyin', HOME, '-name', q])
  } catch {
    return []
  }
  const lq = q.toLowerCase()
  return out
    .split('\n')
    .filter((p) => p && !SKIP.test(p))
    .map((p) => {
      const name = path.basename(p)
      const lname = name.toLowerCase()
      const rank = lname === lq ? 0 : lname.startsWith(lq) ? 1 : lname.includes(lq) ? 2 : 3
      return { path: p, name, rank, depth: p.split('/').length }
    })
    .sort((a, b) => a.rank - b.rank || a.depth - b.depth || a.name.length - b.name.length)
    .slice(0, limit)
    .map(({ path: p, name }) => {
      let isDir = false
      try {
        isDir = fs.statSync(p).isDirectory()
      } catch {
        /* vanished */
      }
      return { path: p, name, isDir }
    })
}

const APP_DIRS = [
  '/Applications',
  path.join(HOME, 'Applications'),
  '/System/Applications',
  '/System/Applications/Utilities',
  '/Applications/Utilities'
]
let appCache = { at: 0, fuse: null }

async function listApps() {
  const found = new Set()
  try {
    const out = await run(
      'mdfind',
      ['kMDItemKind == "Application"', ...APP_DIRS.flatMap((d) => ['-onlyin', d])],
      { timeout: 4000 }
    )
    out
      .split('\n')
      .filter((p) => p.endsWith('.app'))
      .forEach((p) => found.add(p))
  } catch {
    /* fall through to directory listing */
  }
  if (found.size === 0) {
    for (const dir of APP_DIRS) {
      try {
        for (const f of fs.readdirSync(dir)) if (f.endsWith('.app')) found.add(path.join(dir, f))
      } catch {
        /* dir missing */
      }
    }
  }
  return [...found]
    .filter((p) => !p.includes('.app/'))
    .map((p) => ({ path: p, name: path.basename(p, '.app') }))
}

export async function searchApps(query, { limit = 3 } = {}) {
  const q = String(query).trim().slice(0, 60)
  if (q.length < 2) return []
  if (!appCache.fuse || Date.now() - appCache.at > 5 * 60_000) {
    appCache = {
      at: Date.now(),
      fuse: new Fuse(await listApps(), { keys: ['name'], threshold: 0.3, ignoreLocation: true })
    }
  }
  return appCache.fuse.search(q, { limit }).map((r) => r.item)
}

export const warmApps = () => searchApps('xx').catch(() => {})
