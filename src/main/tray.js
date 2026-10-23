import { Menu, Tray, nativeImage } from 'electron'
import { formatClock } from '../shared/durations.js'

/** Monochrome "C" ring drawn into a template bitmap (macOS tints it for light/dark menu bars). */
export function makeTrayIcon() {
  const size = 36 // 18pt @2x
  const buf = Buffer.alloc(size * size * 4)
  const c = (size - 1) / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - c
      const dy = y - c
      const r = Math.hypot(dx, dy)
      const angle = Math.abs(Math.atan2(dy, dx)) // 0 at the right
      const ring = Math.min(1, Math.max(0, Math.min(r - 9.2, 14 - r)))
      const gap = angle < 0.62 ? Math.max(0, 1 - (0.62 - angle) * 12) : 1 // opening on the right
      const dot = Math.max(0, Math.min(1, 3.4 - Math.hypot(dx - 7.5, dy)))
      const a = Math.round(255 * Math.max(Math.min(ring, gap), dot))
      const i = (y * size + x) * 4
      buf[i] = 0
      buf[i + 1] = 0
      buf[i + 2] = 0
      buf[i + 3] = a
    }
  }
  const img = nativeImage.createFromBitmap(buf, { width: size, height: size, scaleFactor: 2 })
  img.setTemplateImage(true)
  return img
}

/**
 * Menu-bar item.
 *  deps.getTimers()        -> active timer views
 *  deps.getRecording()     -> { recording, startedAt }
 *  deps.actions            -> { open, openWidget, openSettings, stopRecording, checkPermissions, quit }
 */
export function createTray({
  getTimers,
  getRecording,
  getTitleEnabled,
  getExtraTitle = () => '',
  actions
}) {
  const tray = new Tray(makeTrayIcon())
  tray.setToolTip('Cast')
  let ticker = null
  let flashing = null

  const labelFor = (t, now) => {
    const name = t.label || (t.kind === 'timer' ? 'Timer' : 'Stopwatch')
    return `${name} — ${formatClock(t.kind === 'timer' ? t.remainingMs : t.elapsedMs)}${t.state === 'paused' ? ' (paused)' : ''}${now ? '' : ''}`
  }

  function title() {
    const rec = getRecording()
    if (rec.recording) return `● ${formatClock(Date.now() - rec.startedAt)}`
    if (!getTitleEnabled()) return getExtraTitle()
    const running = getTimers().filter((t) => t.state === 'running')
    const timer = running
      .filter((t) => t.kind === 'timer')
      .sort((a, b) => a.remainingMs - b.remainingMs)[0]
    if (timer) return formatClock(timer.remainingMs)
    const sw = running.find((t) => t.kind === 'stopwatch')
    return sw ? formatClock(sw.elapsedMs) : getExtraTitle()
  }

  function render() {
    if (flashing) return
    tray.setTitle(title(), { fontType: 'monospacedDigit' })
  }

  function buildMenu() {
    const now = Date.now()
    const timers = getTimers().map((t) => ({
      label: labelFor(t, now),
      click: () =>
        actions.openWidget(t.kind === 'timer' ? 'timer.start' : 'stopwatch.start', {
          timerId: t.id
        })
    }))
    const rec = getRecording()
    return Menu.buildFromTemplate([
      { label: 'Open Cast', click: actions.open },
      { type: 'separator' },
      { label: 'Active timers', enabled: false },
      ...(timers.length ? timers : [{ label: 'None running', enabled: false }]),
      ...(rec.recording
        ? [{ type: 'separator' }, { label: 'Stop recording', click: actions.stopRecording }]
        : []),
      { type: 'separator' },
      { label: 'Settings…', accelerator: 'Command+,', click: actions.openSettings },
      { label: 'Check permissions', click: actions.checkPermissions },
      { type: 'separator' },
      { label: 'Quit Cast', accelerator: 'Command+Q', click: actions.quit }
    ])
  }

  tray.on('click', actions.toggle)
  tray.on('right-click', () => tray.popUpContextMenu(buildMenu()))

  const api = {
    /** Call whenever timers / recording state changes; runs a 1 s ticker only while needed. */
    refresh() {
      const needsTick =
        getRecording().recording ||
        (getTitleEnabled() && getTimers().some((t) => t.state === 'running'))
      if (needsTick && !ticker) ticker = setInterval(render, 1000)
      if (!needsTick && ticker) {
        clearInterval(ticker)
        ticker = null
      }
      render()
    },
    /** Flash the menu-bar title briefly when a timer completes. */
    flash(text = '⏰ Done') {
      if (flashing) clearInterval(flashing)
      let n = 0
      flashing = setInterval(() => {
        tray.setTitle(n % 2 === 0 ? text : '')
        if (++n >= 8) {
          clearInterval(flashing)
          flashing = null
          render()
        }
      }, 500)
    },
    destroy() {
      if (ticker) clearInterval(ticker)
      if (flashing) clearInterval(flashing)
      tray.destroy()
    }
  }
  return api
}
