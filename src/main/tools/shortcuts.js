import Fuse from 'fuse.js'
import { fail, run } from './exec.js'

/** macOS Shortcuts via the `shortcuts` CLI (macOS 12+). The list is cached briefly. */
export function createShortcutsService({ now = Date.now } = {}) {
  let cache = { at: 0, names: [] }
  async function list() {
    if (now() - cache.at < 120_000) return cache.names
    try {
      const { stdout } = await run('shortcuts', ['list'], { timeout: 8000 })
      cache = {
        at: now(),
        names: stdout
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
      }
    } catch {
      cache = { at: now(), names: [] }
    }
    return cache.names
  }
  return {
    list,
    async search(query, limit = 5) {
      const names = await list()
      if (!query) return names.slice(0, limit)
      return new Fuse(names, { threshold: 0.25, ignoreLocation: true, minMatchCharLength: 3 })
        .search(query, { limit })
        .map((r) => r.item)
    },
    async run(name, input) {
      const names = await list()
      if (!names.includes(name)) throw fail('NOT_FOUND', `No shortcut named “${name}”`)
      try {
        const { stdout } = await run(
          'shortcuts',
          ['run', name, ...(input ? ['--input-path', '-'] : [])],
          { timeout: 120_000, input }
        )
        return stdout.trim()
      } catch (e) {
        throw fail('FAILED', `“${name}” failed: ${(e.stderr || e.message).trim().slice(0, 160)}`)
      }
    }
  }
}
