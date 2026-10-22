import fs from 'node:fs'

/**
 * Encrypted key/value store for API keys and OAuth tokens. The whole map is encrypted with
 * Electron safeStorage (macOS Keychain) and written to `secrets.bin`. Secrets are never
 * returned to the renderer; refuses to store anything if encryption is unavailable.
 */
export function createSecretStore({
  file,
  safeStorage,
  isAvailable = () => safeStorage.isEncryptionAvailable()
}) {
  let cache = null

  function load() {
    if (cache) return cache
    cache = {}
    if (!fs.existsSync(file)) return cache
    try {
      if (!isAvailable()) return cache
      cache = JSON.parse(safeStorage.decryptString(fs.readFileSync(file)))
    } catch {
      cache = {}
    }
    return cache
  }

  function persist() {
    if (!isAvailable()) {
      const err = new Error('Secure storage is unavailable on this system')
      err.code = 'ENCRYPTION_UNAVAILABLE'
      throw err
    }
    const tmp = `${file}.tmp`
    fs.writeFileSync(tmp, safeStorage.encryptString(JSON.stringify(cache)), { mode: 0o600 })
    fs.renameSync(tmp, file)
  }

  return {
    get: (name) => load()[name] ?? null,
    has: (name) => Boolean(load()[name]),
    set(name, value) {
      load()
      const prev = cache[name]
      cache[name] = value
      try {
        persist()
      } catch (e) {
        if (prev === undefined) delete cache[name]
        else cache[name] = prev
        throw e
      }
    },
    delete(name) {
      load()
      if (!(name in cache)) return
      delete cache[name]
      persist()
    }
  }
}
