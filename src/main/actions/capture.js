import { execFile } from 'node:child_process'
import fs from 'node:fs'
import { ensureDir, expandHome, sleep, uniquePath } from './paths.js'

export class CaptureError extends Error {
  constructor(code, message, extra = {}) {
    super(message)
    this.code = code
    Object.assign(this, extra)
  }
}

/** Screen Recording permission gate shared by screenshots and recordings. */
export function assertScreenPermission(systemPreferences) {
  const status = systemPreferences.getMediaAccessStatus('screen')
  if (status === 'denied' || status === 'restricted') {
    throw new CaptureError('PERMISSION', 'Screen Recording permission required', {
      permission: 'screen'
    })
  }
}

const FLAGS = {
  full: [],
  area: ['-i', '-s'],
  window: ['-i', '-w']
}

/**
 * Screenshots through the macOS `screencapture` CLI. Always invoked with an argv array.
 * The launcher is hidden first so it never appears in the capture.
 */
export function createScreenshotter({
  getSettings,
  systemPreferences,
  clipboard,
  nativeImage,
  shell,
  capturesRepo,
  hideLauncher,
  notify,
  log
}) {
  return async function screenshot(variant) {
    if (!(variant in FLAGS)) throw new CaptureError('INVALID', 'Unknown screenshot type')
    assertScreenPermission(systemPreferences)
    const settings = getSettings()
    const dir = ensureDir(expandHome(settings.screenshotFolder))
    const ext = settings.screenshotFormat
    const file = uniquePath(dir, 'Cast Screenshot', ext)

    hideLauncher()
    await sleep(150)

    await new Promise((resolve, reject) => {
      execFile('screencapture', [...FLAGS[variant], '-x', '-t', ext, file], (err) =>
        err ? reject(err) : resolve()
      )
    }).catch((e) => {
      log?.warn('screencapture failed', e)
      throw new CaptureError('FAILED', 'Screenshot failed')
    })

    if (!fs.existsSync(file)) return { cancelled: true } // user pressed Esc during selection

    if (settings.copyScreenshotToClipboard) {
      const img = nativeImage.createFromPath(file)
      if (!img.isEmpty()) clipboard.writeImage(img)
    }
    capturesRepo.insert({ kind: 'screenshot', path: file })
    notify({
      title: 'Screenshot saved',
      body: file.replace(process.env.HOME ?? '', '~'),
      actions: [{ text: 'Reveal in Finder', onAction: () => shell.showItemInFolder(file) }],
      onClick: () => shell.showItemInFolder(file)
    })
    return { path: file }
  }
}
