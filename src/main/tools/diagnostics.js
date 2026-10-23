import fs from 'node:fs'
import os from 'node:os'

/**
 * A plain-text report to paste into a bug report. Contains versions, settings (no secrets),
 * permission states and the tail of the log — nothing you typed, no keys, no tokens.
 */
export function buildDiagnostics({
  app,
  settings,
  secretsStatus,
  permissions,
  status,
  logFile,
  counts
}) {
  let log = ''
  try {
    log = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).slice(-40).join('\n')
  } catch {
    /* no log yet */
  }
  const s = settings.all()
  const safeSettings = Object.fromEntries(
    Object.entries(s).map(([k, v]) => [
      k,
      /folder|vault|path|location|pageid|clientid/i.test(k) && v ? '(set)' : v
    ])
  )
  return [
    `Cast ${app.getVersion()} · Electron ${process.versions.electron} · Chrome ${process.versions.chrome}`,
    `macOS ${process.getSystemVersion?.() ?? os.release()} · ${os.arch()} · ${Math.round(os.totalmem() / 1e9)} GB RAM`,
    `Generated ${new Date().toISOString()}`,
    '',
    `Status: ${JSON.stringify(status)}`,
    `Permissions: ${JSON.stringify(permissions)}`,
    `Secrets configured: ${JSON.stringify(secretsStatus)}`,
    `Data: ${JSON.stringify(counts)}`,
    '',
    'Settings:',
    JSON.stringify(safeSettings, null, 2),
    '',
    'Recent log:',
    log || '(empty)'
  ].join('\n')
}
