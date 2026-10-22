import { describe, expect, it } from 'vitest'
import { rank, scoreSuggestion, WEIGHTS } from '../src/shared/ranking.js'

const row = (key, o = {}) => ({
  key,
  actionId: key.split(':')[0],
  matchScore: 0,
  aiConfidence: 0,
  priority: 0,
  ...o
})
const DAY = 86_400_000

describe('scoreSuggestion', () => {
  it('follows 0.5·match + 0.3·ai + 0.1·recency + 0.1·frequency', () => {
    expect(WEIGHTS).toEqual({ match: 0.5, ai: 0.3, recency: 0.1, frequency: 0.1 })
    expect(scoreSuggestion(row('a:1', { matchScore: 1, aiConfidence: 1 }))).toBeCloseTo(0.8)
    expect(scoreSuggestion(row('a:1', { matchScore: 0.5 }))).toBeCloseTo(0.25)
  })

  it('recency decays and frequency saturates', () => {
    const now = 100 * DAY
    const fresh = scoreSuggestion(row('a:1'), { a: { count: 1, lastUsed: now } }, now)
    const old = scoreSuggestion(row('a:1'), { a: { count: 1, lastUsed: now - 30 * DAY } }, now)
    expect(fresh).toBeGreaterThan(old)
    const heavy = scoreSuggestion(row('a:1'), { a: { count: 10_000, lastUsed: 0 } }, now)
    expect(heavy).toBeLessThanOrEqual(0.1 + 1e-9)
  })

  it('AI term is 0 when unavailable', () => {
    expect(scoreSuggestion(row('a:1', { matchScore: 1 }))).toBeCloseTo(0.5)
  })
})

describe('rank', () => {
  it('sorts by score, breaks ties by priority, caps the list', () => {
    const list = [
      row('a:1', { matchScore: 0.5, priority: 1 }),
      row('b:1', { matchScore: 0.9 }),
      row('c:1', { matchScore: 0.5, priority: 9 })
    ]
    expect(rank(list, { max: 2 }).map((r) => r.key)).toEqual(['b:1', 'c:1'])
  })

  it('merges duplicates from local and AI tiers (same actionId+params)', () => {
    const local = row('timer.start:{"d":1}', { matchScore: 0.6, title: 'Local' })
    const ai = row('timer.start:{"d":1}', {
      aiConfidence: 0.9,
      source: 'ai',
      title: 'AI title',
      subtitle: 'sub'
    })
    const out = rank([local, ai])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ matchScore: 0.6, aiConfidence: 0.9, title: 'AI title' })
  })

  it('boosts frequently/recently used actions', () => {
    const now = 10 * DAY
    const list = [row('a:1', { matchScore: 0.5 }), row('b:1', { matchScore: 0.5 })]
    const out = rank(list, { stats: { b: { count: 20, lastUsed: now } }, now })
    expect(out[0].key).toBe('b:1')
  })

  it('does not mutate input rows', () => {
    const r = row('a:1', { matchScore: 1 })
    rank([r])
    expect(r.score).toBeUndefined()
  })
})
