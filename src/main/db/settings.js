import { DEFAULT_SETTINGS, SETTING_KEYS, validateSetting } from '../../shared/settings.js'

export function getAllSettings(db) {
  const out = { ...DEFAULT_SETTINGS }
  for (const row of db.prepare('SELECT key, value FROM settings').all()) {
    if (!SETTING_KEYS.includes(row.key)) continue
    try {
      out[row.key] = validateSetting(row.key, JSON.parse(row.value))
    } catch {
      // corrupt or outdated value: fall back to the default
    }
  }
  return out
}

export function getSetting(db, key) {
  return getAllSettings(db)[key]
}

/** Validates, persists, and returns the normalized value. */
export function setSetting(db, key, value) {
  const normalized = validateSetting(key, value)
  db.prepare(
    'INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, JSON.stringify(normalized))
  return normalized
}
