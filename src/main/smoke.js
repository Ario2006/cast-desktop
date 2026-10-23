import fs from 'node:fs'
import { join } from 'node:path'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Developer smoke test (CAST_SMOKE=1): drives the real launcher, writes screenshots + a JSON
 * report, then quits. Steps come from CAST_SMOKE_STEPS (JSON): [{ type: "25m" , shot: "a" }, { key: "Enter" }]
 */
export async function runSmoke({ windows, log, app, setSetting }) {
  const out = process.env.CAST_SMOKE_OUT || join(app.getPath('temp'), 'cast-smoke')
  fs.mkdirSync(out, { recursive: true })
  const steps = JSON.parse(process.env.CAST_SMOKE_STEPS || '[]')
  for (const [k, v] of Object.entries(JSON.parse(process.env.CAST_SMOKE_SETTINGS || '{}')))
    setSetting(k, v)
  const report = { errors: [], steps: [] }
  const wc = windows.webContents
  wc.on('console-message', (_e, level, message) => {
    if (level >= 2) report.errors.push(message)
  })
  wc.on('render-process-gone', (_e, d) => report.errors.push(`renderer gone: ${d.reason}`))
  await new Promise((r) => (wc.isLoading() ? wc.once('did-finish-load', r) : r()))
  windows.show()
  await wait(600)
  await wc.executeJavaScript(
    `window.__errs = []; window.addEventListener('error', e => window.__errs.push(String(e.error?.stack || e.message))); window.addEventListener('unhandledrejection', e => window.__errs.push(String(e.reason?.stack || e.reason)))`
  )

  const js = (code) => wc.executeJavaScript(code)
  for (const step of steps) {
    // instant actions hide the launcher; reopen it like the shortcut would
    if (!windows.isVisible()) {
      windows.show()
      await wait(400)
    }
    if (step.type !== undefined) {
      await js(`(() => { const el = document.querySelector('input'); el.focus();
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, ${JSON.stringify(step.type)});
        el.dispatchEvent(new Event('input', { bubbles: true })); })()`)
    }
    if (step.key) {
      await js(
        `window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(step.key)}, metaKey: ${!!step.meta}, shiftKey: ${!!step.shift}, bubbles: true }))`
      )
    }
    if (step.eval) report.steps.push({ eval: step.eval, result: await js(step.eval) })
    await wait(step.wait ?? 500)
    if (step.shot) {
      const img = await wc.capturePage()
      fs.writeFileSync(join(out, `${step.shot}.png`), img.toPNG())
    }
    if (step.rows) {
      report.steps.push({
        rows: await js(
          `[...document.querySelectorAll('[role=option]')].map(e => e.innerText.replace(/\\n+/g,' | '))`
        )
      })
    }
  }
  report.pageErrors = await js('window.__errs').catch(() => [])
  if (process.env.CAST_SMOKE_TRAYICON) {
    const { makeTrayIcon } = await import('./tray.js')
    fs.writeFileSync(
      join(out, 'tray.png'),
      makeTrayIcon().resize({ width: 144, height: 144 }).toPNG()
    )
  }
  fs.writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2))
  log.info('smoke done')
  app.exit(0)
}
