import { describe, expect, it } from 'vitest'
import {
  buildSearchUrl,
  looksLikePath,
  normalizeUrl,
  parseSearchPrefix
} from '../src/shared/search.js'

describe('search helpers', () => {
  it('parses engine prefixes', () => {
    expect(parseSearchPrefix('g cats')).toEqual({ engine: 'google', query: 'cats' })
    expect(parseSearchPrefix('ddg private stuff')).toEqual({
      engine: 'duckduckgo',
      query: 'private stuff'
    })
    expect(parseSearchPrefix('yt lofi beats')).toEqual({ engine: 'youtube', query: 'lofi beats' })
    expect(parseSearchPrefix('gold prices')).toBeNull()
    expect(parseSearchPrefix('g')).toBeNull()
  })

  it('builds URLs with encoded queries and custom templates', () => {
    expect(buildSearchUrl('google', 'a b&c')).toBe('https://www.google.com/search?q=a%20b%26c')
    expect(buildSearchUrl('custom', 'x y', 'https://example.com/?q={query}')).toBe(
      'https://example.com/?q=x%20y'
    )
    expect(buildSearchUrl('custom', 'x', '')).toContain('google.com')
  })

  it('normalizeUrl only yields http(s) URLs', () => {
    expect(normalizeUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1')
    expect(normalizeUrl('example.com')).toBe('https://example.com')
    expect(normalizeUrl('github.com/foo/bar')).toBe('https://github.com/foo/bar')
    expect(normalizeUrl('file:///etc/passwd')).toBeNull()
    expect(normalizeUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeUrl('notes.txt')).toBeNull()
    expect(normalizeUrl('two words.com')).toBeNull()
  })

  it('looksLikePath', () => {
    expect(looksLikePath('~/Documents/a.txt')).toBe(true)
    expect(looksLikePath('/Applications')).toBe(true)
    expect(looksLikePath('~')).toBe(true)
    expect(looksLikePath('hello/world')).toBe(false)
    expect(looksLikePath('/ ')).toBe(false)
  })
})
