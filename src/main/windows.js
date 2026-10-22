import { join } from 'node:path'
import { BrowserWindow, screen, session } from 'electron'
import { IPC, WINDOW } from '../shared/constants.js'

const MIN_HEIGHT = 140
const MAX_HEIGHT = 860 // settings view is taller than the launcher list

export const rendererTarget = (page) => {
  const dev = process.env.ELECTRON_RENDERER_URL
  return dev
    ? { url: `${dev}/${page}`, file: null }
    : { url: null, file: join(__dirname, `../renderer/${page}`) }
}

export const rendererUrl = (page) => {
  const t = rendererTarget(page)
  return t.url ?? `file://${t.file}`
}

/**
 * The launcher is created once (hidden) and then shown/hidden — never destroyed — so the
 * shortcut → visible path stays well under 150 ms.
 *
 * Window style: frameless + transparent. The floating card, pastel frame and soft shadow are
 * rendered by the renderer (see styles/theme.css); the window adds a transparent margin so the
 * shadow has room to fade out.
 */
export function createWindows({ getSettings, log }) {
  let win = null
  let height = MIN_HEIGHT
  let suppressBlurUntil = 0
  let pendingWidget = null
  const listeners = new Set()

  function build() {
    win = new BrowserWindow({
      width: WINDOW.width,
      height,
      show: false,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      // The card, its frame and its shadow are all drawn in CSS inside a transparent window.
      transparent: true,
      hasShadow: false,
      type: 'panel',
      backgroundColor: '#00000000',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        spellcheck: false,
        backgroundThrottling: false
      }
    })
    win.setAlwaysOnTop(true, 'floating')
    win.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true
    })

    // Hardening: nothing may open windows or navigate away from the app bundle.
    const wc = win.webContents
    wc.setWindowOpenHandler(() => ({ action: 'deny' }))
    wc.on('will-navigate', (e) => e.preventDefault())
    wc.on('will-attach-webview', (e) => e.preventDefault())
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))

    win.on('blur', () => {
      if (!win.isVisible() || Date.now() < suppressBlurUntil || process.env.CAST_SMOKE) return
      if (getSettings().hideOnBlur) api.hide()
    })
    wc.on('did-finish-load', () => {
      if (pendingWidget) {
        wc.send(IPC.launcherOpenWidget, pendingWidget)
        pendingWidget = null
      }
    })
    wc.on('render-process-gone', (_e, details) => {
      log?.error('launcher renderer gone', { reason: details.reason })
      if (details.reason !== 'clean-exit') {
        win.reload()
      }
    })

    const target = rendererTarget('index.html')
    if (target.url) win.loadURL(target.url)
    else win.loadFile(target.file)
    return win
  }

  function place() {
    const settings = getSettings()
    const point = screen.getCursorScreenPoint()
    const display = settings.showOnActiveDisplay
      ? screen.getDisplayNearestPoint(point)
      : screen.getPrimaryDisplay()
    const { x, y, width, height: dh } = display.workArea
    win.setBounds({
      x: Math.round(x + (width - WINDOW.width) / 2),
      y: Math.round(y + dh * WINDOW.topOffsetRatio),
      width: WINDOW.width,
      height
    })
  }

  const api = {
    create: build,
    get window() {
      return win
    },
    get webContents() {
      return win?.webContents
    },
    isVisible: () => Boolean(win?.isVisible()),
    isFromLauncher: (event) =>
      Boolean(win) && !win.isDestroyed() && event.sender === win.webContents,
    onVisibility: (fn) => (listeners.add(fn), () => listeners.delete(fn)),

    /** Show the launcher; optionally open a widget straight away (e.g. from a notification). */
    show({ widget, settings: openSettings, section } = {}) {
      if (!win || win.isDestroyed()) build()
      if (!win.isVisible()) place()
      suppressBlurUntil = Date.now() + 300
      win.show()
      win.focus()
      win.webContents.send(IPC.windowShown)
      if (widget) win.webContents.send(IPC.launcherOpenWidget, widget)
      if (openSettings) win.webContents.send(IPC.launcherOpenSettings, { section })
      listeners.forEach((fn) => fn(true))
    },

    hide() {
      if (!win || !win.isVisible()) return
      win.hide()
      win.webContents.send(IPC.windowHidden)
      listeners.forEach((fn) => fn(false))
    },

    toggle() {
      if (api.isVisible()) api.hide()
      else api.show()
    },

    resize(h) {
      height = Math.round(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, h)))
      if (!win || win.isDestroyed()) return
      const b = win.getBounds()
      if (b.height !== height) win.setBounds({ ...b, height })
    },

    /** Keep the window open briefly while another surface (e.g. a dialog) takes focus. */
    suppressBlur(ms = 1500) {
      suppressBlurUntil = Date.now() + ms
    },

    send(channel, payload) {
      if (win && !win.isDestroyed() && !win.webContents.isDestroyed())
        win.webContents.send(channel, payload)
    }
  }
  return api
}
