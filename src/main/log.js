import fs from 'node:fs'
import path from 'node:path'

const MAX_BYTES = 1024 * 1024
const KEEP = 3
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 }

/**
 * Tiny rotating file logger (1 MB x 3). Callers must never pass query text, tokens or keys;
 * `debug` is off by default for that reason.
 */
export function createLogger(dir, { level = 'info' } = {}) {
  const file = path.join(dir, 'cast.log')
  let size = 0
  try {
    fs.mkdirSync(dir, { recursive: true })
    size = fs.existsSync(file) ? fs.statSync(file).size : 0
  } catch {
    // logging must never take the app down
  }

  function rotate() {
    try {
      for (let i = KEEP - 1; i >= 1; i--) {
        const from = i === 1 ? file : `${file}.${i - 1}`
        if (fs.existsSync(from)) fs.renameSync(from, `${file}.${i}`)
      }
    } catch {
      /* ignore */
    }
    size = 0
  }

  function write(lvl, msg, meta) {
    if (LEVELS[lvl] > LEVELS[level]) return
    const line = `${new Date().toISOString()} ${lvl.toUpperCase()} ${msg}${meta ? ` ${safeJson(meta)}` : ''}\n`
    try {
      if (size + line.length > MAX_BYTES) rotate()
      fs.appendFileSync(file, line)
      size += line.length
    } catch {
      /* ignore */
    }
  }

  return {
    file,
    error: (m, meta) => write('error', m, meta),
    warn: (m, meta) => write('warn', m, meta),
    info: (m, meta) => write('info', m, meta),
    debug: (m, meta) => write('debug', m, meta)
  }
}

function safeJson(v) {
  try {
    if (v instanceof Error)
      return JSON.stringify({ name: v.name, message: v.message, code: v.code })
    return JSON.stringify(v)
  } catch {
    return '"[unserializable]"'
  }
}
