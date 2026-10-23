import { layoutFrame } from '../../shared/commands.js'
import { fail, osascript } from './exec.js'

const GET = `tell application "System Events"
  set p to first application process whose frontmost is true
  set w to window 1 of p
  set {x, y} to position of w
  set {ww, hh} to size of w
  return (name of p) & "," & x & "," & y & "," & ww & "," & hh
end tell`
const SET = `on run argv
  tell application "System Events"
    set p to first application process whose frontmost is true
    tell window 1 of p
      set position to {(item 1 of argv) as integer, (item 2 of argv) as integer}
      set size to {(item 3 of argv) as integer, (item 4 of argv) as integer}
    end tell
  end tell
end run`

/**
 * Snap the frontmost app's window (needs the Accessibility permission). The launcher is hidden
 * first so the previous app is frontmost again.
 */
export function createWindowLayout({ screen, systemPreferences, hideLauncher }) {
  return async function applyLayout(layout) {
    if (!systemPreferences.isTrustedAccessibilityClient(false)) {
      systemPreferences.isTrustedAccessibilityClient(true) // shows the macOS prompt
      throw fail('PERMISSION', 'Window layouts need the Accessibility permission', {
        permission: 'accessibility'
      })
    }
    hideLauncher()
    await new Promise((r) => setTimeout(r, 220))
    const raw = await osascript(GET, [], { permissionFor: 'System Events' })
    const [app, ...nums] = raw.split(',')
    const [x, y, width, height] = nums.map(Number)
    if (![x, y, width, height].every(Number.isFinite))
      throw fail('NO_WINDOW', 'No window to arrange')
    if (/^(Cast|Electron)$/.test(app))
      throw fail('NO_WINDOW', 'Switch to the app you want to arrange first')
    const current = { x, y, width, height }
    const displays = screen.getAllDisplays()
    const here = screen.getDisplayMatching(current)
    let target
    if (layout === 'nextdisplay') {
      if (displays.length < 2) throw fail('UNSUPPORTED', 'Only one display connected')
      const next = displays[(displays.findIndex((d) => d.id === here.id) + 1) % displays.length]
      const a = here.workArea
      const b = next.workArea
      // keep the window's relative position and size
      target = {
        x: Math.round(b.x + ((x - a.x) / a.width) * b.width),
        y: Math.round(b.y + ((y - a.y) / a.height) * b.height),
        width: Math.round(Math.min(width, b.width)),
        height: Math.round(Math.min(height, b.height))
      }
    } else {
      target = layoutFrame(layout, here.workArea, current)
    }
    if (!target) throw fail('INVALID', 'Unknown layout')
    await osascript(SET, [target.x, target.y, target.width, target.height].map(String), {
      permissionFor: 'System Events'
    })
    return app
  }
}
