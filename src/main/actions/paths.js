import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const expandHome = (p) =>
  p === '~' ? os.homedir() : p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

/** "Cast Screenshot 2026-10-22 at 15.43.21.png" */
export function timestampName(prefix, ext, date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  const d = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  const t = `${pad(date.getHours())}.${pad(date.getMinutes())}.${pad(date.getSeconds())}`
  return `${prefix} ${d} at ${t}.${ext}`
}

/** Unique path inside `dir` for a timestamped file (never overwrites). */
export function uniquePath(dir, prefix, ext) {
  const base = timestampName(prefix, ext)
  let candidate = path.join(dir, base)
  for (let i = 2; fs.existsSync(candidate); i++) {
    candidate = path.join(dir, base.replace(`.${ext}`, ` (${i}).${ext}`))
  }
  return candidate
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
