import { fail, run } from './exec.js'

/** Parse `lsof -nP -iTCP -sTCP:LISTEN -F pcn` output into [{ pid, command, port, address }]. */
export function parseLsof(out) {
  const rows = []
  let pid = null
  let command = null
  for (const line of String(out).split('\n')) {
    const tag = line[0]
    const val = line.slice(1)
    if (tag === 'p') pid = Number(val)
    else if (tag === 'c') command = val
    else if (tag === 'n') {
      const m = val.match(/^(.*):(\d+)$/)
      if (m && pid)
        rows.push({
          pid,
          command,
          port: Number(m[2]),
          address: m[1] === '*' ? 'all interfaces' : m[1]
        })
    }
  }
  // one row per (pid, port)
  const seen = new Set()
  return rows
    .filter((r) => (seen.has(`${r.pid}:${r.port}`) ? false : seen.add(`${r.pid}:${r.port}`)))
    .sort((a, b) => a.port - b.port)
}

export async function listPorts() {
  try {
    const { stdout } = await run('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-F', 'pcn'], {
      timeout: 8000
    })
    return parseLsof(stdout)
  } catch (e) {
    if (e.code === 1 && !e.stdout) return [] // lsof exits 1 when nothing matches
    return parseLsof(e.stdout ?? '')
  }
}

/** Stop the process listening on `port` (only your own processes are visible / killable). */
export async function killPort(port, { confirmed, selfPid = process.pid } = {}) {
  const procs = (await listPorts()).filter((p) => p.port === port)
  if (!procs.length) throw fail('NOT_FOUND', `Nothing is listening on port ${port}`)
  if (procs.some((p) => p.pid === selfPid))
    throw fail('INVALID', 'That port belongs to Cast itself')
  const names = [...new Set(procs.map((p) => `${p.command} (${p.pid})`))].join(', ')
  if (!confirmed) throw fail('CONFIRM', `Stop ${names} listening on port ${port}?`)
  for (const p of procs) {
    try {
      process.kill(p.pid, 'SIGTERM')
    } catch (e) {
      throw fail('FAILED', e.code === 'EPERM' ? `Not allowed to stop ${p.command}` : e.message)
    }
  }
  return `Stopped ${names}`
}
