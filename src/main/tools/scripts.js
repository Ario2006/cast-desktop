import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fail, run } from './exec.js'

const expand = (p) => (p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p)

const EXAMPLE = `#!/bin/bash
# @cast.title Hello from Cast
# @cast.description An example script: prints the date and your argument
# @cast.mode output
# @cast.argument name

echo "Hello, \${1:-world}! It's $(date '+%A %H:%M')."
`

/** Read the "# @cast.key value" metadata header of a script. */
export function parseScriptMeta(source, file) {
  const meta = {
    title: path.basename(file).replace(/\.[^.]+$/, ''),
    description: '',
    mode: 'output',
    argument: null
  }
  for (const line of String(source).split('\n').slice(0, 30)) {
    const m = line.match(/^\s*(?:#|\/\/|--)\s*@cast\.(title|description|mode|argument)\s+(.+?)\s*$/)
    if (m) meta[m[1]] = m[2]
  }
  if (!['output', 'silent', 'copy'].includes(meta.mode)) meta.mode = 'output'
  return meta
}

/**
 * Script commands: executable files in one folder you choose. Only files directly inside that
 * folder (no symlinks pointing elsewhere) can run, with an argv argument — never a shell string.
 */
export function createScripts({ getSettings }) {
  const folder = () => expand(getSettings().scriptsFolder)

  function ensureFolder() {
    const dir = folder()
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
      const ex = path.join(dir, 'hello.sh')
      fs.writeFileSync(ex, EXAMPLE, { mode: 0o755 })
    }
    return dir
  }

  function list() {
    if (!getSettings().scriptsEnabled) return []
    const dir = ensureFolder()
    const out = []
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name)
      try {
        const st = fs.statSync(file)
        if (!st.isFile() || !(st.mode & 0o111) || name.startsWith('.')) continue
        const real = fs.realpathSync(file)
        if (path.dirname(real) !== fs.realpathSync(dir)) continue
        out.push({
          id: name,
          file: real,
          ...parseScriptMeta(fs.readFileSync(real, 'utf8').slice(0, 4000), name)
        })
      } catch {
        /* unreadable: skip */
      }
    }
    return out.sort((a, b) => a.title.localeCompare(b.title))
  }

  return {
    folder,
    ensureFolder,
    list,
    async run(id, argument) {
      if (!getSettings().scriptsEnabled)
        throw fail('DISABLED', 'Turn on script commands in Settings → Developer')
      const script = list().find((s) => s.id === id)
      if (!script) throw fail('NOT_FOUND', 'Script not found')
      const args = argument ? [String(argument).slice(0, 1000)] : []
      try {
        const { stdout, stderr } = await run(script.file, args, {
          cwd: folder(),
          timeout: 60_000,
          env: {
            PATH: '/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin',
            HOME: os.homedir(),
            LANG: 'en_US.UTF-8'
          }
        })
        return {
          output: (stdout || stderr).trim().slice(0, 20_000),
          mode: script.mode,
          title: script.title
        }
      } catch (e) {
        const msg = (e.stderr || e.stdout || e.message || '').trim().slice(0, 2000)
        throw fail(
          'FAILED',
          e.killed
            ? `${script.title} timed out after 60 s`
            : `${script.title} failed${msg ? `: ${msg}` : ''}`
        )
      }
    }
  }
}
