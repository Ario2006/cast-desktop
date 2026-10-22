import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, SETTING_KEYS, validateSetting } from '../src/shared/settings.js'

describe('settings schema', () => {
  it('every default validates against its own schema', () => {
    for (const k of SETTING_KEYS)
      expect(() => validateSetting(k, DEFAULT_SETTINGS[k]), k).not.toThrow()
  })

  it('rejects unknown keys (including prototype keys)', () => {
    expect(() => validateSetting('nope', 1)).toThrow(/unknown setting/)
    expect(() => validateSetting('constructor', 1)).toThrow(/unknown setting/)
    expect(() => validateSetting('__proto__', 1)).toThrow(/unknown setting/)
  })

  it('AI base URL must be https (or http on localhost) and is normalized', () => {
    expect(validateSetting('aiBaseUrl', 'https://api.example.com/v1/')).toBe(
      'https://api.example.com/v1'
    )
    expect(validateSetting('aiBaseUrl', 'http://localhost:11434/v1')).toBe(
      'http://localhost:11434/v1'
    )
    expect(() => validateSetting('aiBaseUrl', 'http://evil.example.com')).toThrow()
    expect(() => validateSetting('aiBaseUrl', 'ftp://x.com')).toThrow()
    expect(() => validateSetting('aiBaseUrl', 'not a url')).toThrow()
  })

  it('custom search template needs http(s) and {query}', () => {
    expect(validateSetting('customSearchUrl', '')).toBe('')
    expect(validateSetting('customSearchUrl', 'https://x.com/?q={query}')).toBeTruthy()
    expect(() => validateSetting('customSearchUrl', 'https://x.com/')).toThrow()
    expect(() => validateSetting('customSearchUrl', 'javascript:{query}')).toThrow()
  })

  it('bounds numeric and enum settings', () => {
    expect(() => validateSetting('maxResults', 99)).toThrow()
    expect(() => validateSetting('theme', 'neon')).toThrow()
    expect(() => validateSetting('defaultEventMinutes', 0)).toThrow()
    expect(() => validateSetting('hideOnBlur', 'yes')).toThrow()
  })
})
