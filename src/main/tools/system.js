import { SYSTEM_COMMANDS } from '../../shared/commands.js'
import { fail, osascript, run } from './exec.js'

async function wifiDevice() {
  const { stdout } = await run('networksetup', ['-listallhardwareports'])
  const m = stdout.match(/Hardware Port: (?:Wi-Fi|AirPort)\s*\nDevice: (\S+)/)
  if (!m) throw fail('UNSUPPORTED', 'No Wi-Fi interface found')
  return m[1]
}

/**
 * The fixed set of system commands Cast can run. Each is a fixed argv / AppleScript; the only
 * user value is the volume level, which is validated as an integer 0–100.
 * Commands with `confirm` in SYSTEM_COMMANDS must be called with `confirmed: true`.
 */
export async function runSystemCommand({ command, level, confirmed }) {
  const def = SYSTEM_COMMANDS[command]
  if (!def) throw fail('INVALID', 'Unknown system command')
  if (def.confirm && !confirmed) throw fail('CONFIRM', def.confirm)
  switch (command) {
    case 'lock':
    case 'displaysleep':
      await run('pmset', ['displaysleepnow'])
      return def.label
    case 'sleep':
      await run('pmset', ['sleepnow'])
      return def.label
    case 'darkmode':
      await osascript(
        'tell application "System Events" to tell appearance preferences to set dark mode to not dark mode',
        [],
        { permissionFor: 'System Events' }
      )
      return 'Appearance toggled'
    case 'screensaver':
      await run('open', ['-a', 'ScreenSaverEngine'])
      return def.label
    case 'mute':
    case 'unmute':
      await osascript(`set volume output muted ${command === 'mute'}`)
      return command === 'mute' ? 'Muted' : 'Unmuted'
    case 'volume': {
      const v = Math.round(Number(level))
      if (!Number.isInteger(v) || v < 0 || v > 100) throw fail('INVALID', 'Volume must be 0–100')
      await osascript(
        'on run argv\nset volume output volume (item 1 of argv as integer)\nset volume output muted false\nend run',
        [String(v)]
      )
      return `Volume ${v}%`
    }
    case 'wifion':
    case 'wifioff':
      await run('networksetup', [
        '-setairportpower',
        await wifiDevice(),
        command === 'wifion' ? 'on' : 'off'
      ])
      return command === 'wifion' ? 'Wi-Fi on' : 'Wi-Fi off'
    case 'emptytrash':
      await osascript('tell application "Finder" to empty trash', [], {
        permissionFor: 'Finder',
        timeout: 60_000
      })
      return 'Trash emptied'
    case 'restart':
    case 'shutdown':
    case 'logout': {
      const verb = { restart: 'restart', shutdown: 'shut down', logout: 'log out' }[command]
      await osascript(`tell application "System Events" to ${verb}`, [], {
        permissionFor: 'System Events'
      })
      return def.label
    }
    case 'hideall':
      await osascript(
        'tell application "System Events" to set visible of (every process whose visible is true and name is not "Finder" and name is not "Cast") to false',
        [],
        { permissionFor: 'System Events' }
      )
      return 'Apps hidden'
    case 'quitall':
      await osascript(
        `tell application "System Events" to set names to name of (every process whose background only is false and name is not "Finder" and name is not "Cast" and name is not "Electron")
repeat with n in names
  try
    tell application n to quit
  end try
end repeat`,
        [],
        { permissionFor: 'System Events', timeout: 30_000 }
      )
      return 'Apps quit'
    case 'ejectall':
      await osascript(
        'tell application "Finder" to eject (every disk whose ejectable is true)',
        [],
        { permissionFor: 'Finder', timeout: 30_000 }
      )
      return 'Disks ejected'
    default:
      throw fail('INVALID', 'Unknown system command')
  }
}
