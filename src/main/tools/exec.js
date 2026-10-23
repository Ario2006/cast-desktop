import { execFile } from 'node:child_process'

export const fail = (code, message, extra = {}) =>
  Object.assign(new Error(message), { code, ...extra })

/** execFile as a promise. Always argv arrays, never a shell string. */
export function run(cmd, args = [], { timeout = 8000, input, ...opts } = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      cmd,
      args,
      { timeout, maxBuffer: 8 * 1024 * 1024, ...opts },
      (err, stdout, stderr) => {
        if (err) {
          err.stdout = String(stdout ?? '')
          err.stderr = String(stderr ?? '')
          return reject(err)
        }
        resolve({ stdout: String(stdout), stderr: String(stderr) })
      }
    )
    if (input != null) {
      child.stdin?.end(input)
    }
  })
}

/**
 * Run AppleScript with user data passed as argv (`on run argv`), never interpolated into the
 * script source, so names like `"; do shell script "rm…` can't inject code.
 * Maps macOS automation-permission refusals (-1743) to a PERMISSION error.
 */
export async function osascript(script, args = [], { timeout = 10_000, permissionFor } = {}) {
  try {
    const { stdout } = await run('osascript', ['-e', script, ...args], { timeout })
    return stdout.trim()
  } catch (e) {
    if (/-1743|not allowed|not authorized/i.test(e.stderr)) {
      throw fail(
        'PERMISSION',
        `Allow Cast to control ${permissionFor ?? 'that app'} in System Settings → Privacy & Security → Automation`,
        { permission: 'automation' }
      )
    }
    if (/-25211|assistive access|accessibility/i.test(e.stderr)) {
      throw fail(
        'PERMISSION',
        'Allow Cast in System Settings → Privacy & Security → Accessibility',
        { permission: 'accessibility' }
      )
    }
    throw fail(
      'FAILED',
      (e.stderr || e.message)
        .replace(/^\d+:\d+: execution error: /, '')
        .trim()
        .slice(0, 200)
    )
  }
}
