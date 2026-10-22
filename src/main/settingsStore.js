import { getAllSettings, setSetting } from './db/settings.js'

/** In-memory copy of the settings table; the DB stays the source of truth. */
export function createSettingsStore({ db, onChange = () => {} }) {
  let cache = getAllSettings(db)
  return {
    all: () => ({ ...cache }),
    get: (key) => cache[key],
    set(key, value) {
      const normalized = setSetting(db, key, value)
      cache = { ...cache, [key]: normalized }
      onChange(key, normalized)
      return normalized
    }
  }
}
