import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { createSecretStore } from '../src/main/secrets.js'

// Fake safeStorage: "encrypts" by reversing + prefixing so plaintext can never match the file.
const fakeSafeStorage = (available = true) => ({
  isEncryptionAvailable: () => available,
  encryptString: (s) => Buffer.from('ENC:' + [...s].reverse().join('')),
  decryptString: (b) => [...b.toString().slice(4)].reverse().join('')
})

let dir, file
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cast-secrets-'))
  file = path.join(dir, 'secrets.bin')
})

describe('secret store', () => {
  it('round-trips and persists across instances', () => {
    const a = createSecretStore({ file, safeStorage: fakeSafeStorage() })
    a.set('aiApiKey', 'sk-supersecret')
    expect(a.get('aiApiKey')).toBe('sk-supersecret')
    expect(createSecretStore({ file, safeStorage: fakeSafeStorage() }).get('aiApiKey')).toBe(
      'sk-supersecret'
    )
  })

  it('never writes plaintext to disk (acceptance #10)', () => {
    const s = createSecretStore({ file, safeStorage: fakeSafeStorage() })
    s.set('aiApiKey', 'sk-supersecret')
    s.set('googleTokens', '{"refresh_token":"r-123"}')
    const raw = fs.readFileSync(file).toString()
    expect(raw).not.toContain('sk-supersecret')
    expect(raw).not.toContain('r-123')
    expect(raw).not.toContain('aiApiKey')
  })

  it('refuses to store anything when encryption is unavailable', () => {
    const s = createSecretStore({ file, safeStorage: fakeSafeStorage(false) })
    expect(() => s.set('k', 'v')).toThrow(/unavailable/)
    expect(s.has('k')).toBe(false)
    expect(fs.existsSync(file)).toBe(false)
  })

  it('delete removes the value; has() reflects it', () => {
    const s = createSecretStore({ file, safeStorage: fakeSafeStorage() })
    s.set('a', '1')
    expect(s.has('a')).toBe(true)
    s.delete('a')
    expect(s.has('a')).toBe(false)
    expect(s.get('a')).toBeNull()
    expect(() => s.delete('missing')).not.toThrow()
  })

  it('survives a corrupt file', () => {
    fs.writeFileSync(file, 'garbage')
    const s = createSecretStore({
      file,
      safeStorage: {
        ...fakeSafeStorage(),
        decryptString: () => {
          throw new Error('bad')
        }
      }
    })
    expect(s.get('x')).toBeNull()
    expect(() => s.set('x', 'y')).not.toThrow()
  })

  it('writes owner-only permissions', () => {
    createSecretStore({ file, safeStorage: fakeSafeStorage() }).set('a', 'b')
    expect(fs.statSync(file).mode & 0o077).toBe(0)
  })
})
