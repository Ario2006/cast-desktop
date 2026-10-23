import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { _electron as electron } from '@playwright/test'

const ROOT = path.resolve(import.meta.dirname, '../..')

/** Launch the built app with a throwaway data dir; returns { app, page }. */
export async function launch(settings = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cast-e2e-'))
  const app = await electron.launch({
    args: [ROOT],
    cwd: ROOT,
    env: {
      ...process.env,
      CAST_E2E: '1',
      CAST_USER_DATA: dir,
      CAST_SETTINGS: JSON.stringify({ onboarded: true, smartSuggestions: false, ...settings })
    }
  })
  const logs = []
  app.process().stderr?.on('data', (d) => logs.push(String(d)))
  app.process().on('exit', (code, sig) => logs.push(`[app exited code=${code} signal=${sig}]`))
  const page = await app.firstWindow()
  page.on('crash', () => logs.push('[renderer crashed]'))
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
  // first run shows the welcome walkthrough instead of the search box
  await page
    .locator('input[role="combobox"]')
    .or(page.getByText('Welcome to Cast'))
    .first()
    .waitFor()
  app.logs = logs
  return { app, page }
}

export const search = (page) => page.locator('input[role="combobox"]')
export const rows = (page) => page.locator('[role="option"]')
