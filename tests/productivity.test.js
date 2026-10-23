import { describe, expect, it } from 'vitest'
import { openDb } from '../src/main/db/index.js'
import { quicklinksRepo, tasksRepo, timeRepo } from '../src/main/db/productivity.js'

const H = 3_600_000

describe('tasks', () => {
  it('orders open tasks by due date, undated last, then completed', () => {
    const t = tasksRepo(openDb())
    const a = t.create({ text: 'no date', now: 1 })
    const b = t.create({ text: 'later', due: 500, now: 2 })
    const c = t.create({ text: 'soon', due: 100, now: 3 })
    t.update(a.id, { doneAt: 900 })
    expect(t.list().map((x) => x.text)).toEqual(['soon', 'later', 'no date'])
    expect(t.list().at(-1).done).toBe(true)
    expect(t.due(300).map((x) => x.id)).toEqual([c.id])
    expect(t.completedSince(0)).toBe(1)
    expect(t.clearDone()).toBe(1)
    expect(t.delete(b.id)).toBe(true)
  })
})

describe('time tracking', () => {
  it('starting a project stops the previous one; totals clip to the range', () => {
    const tr = timeRepo(openDb())
    tr.start('alpha', 0)
    tr.start('beta', 2 * H) // stops alpha at 2h
    expect(tr.running().project).toBe('beta')
    tr.stop(5 * H)
    expect(tr.running()).toBeNull()
    expect(tr.totals(0, 10 * H, 10 * H)).toEqual([
      { project: 'beta', ms: 3 * H },
      { project: 'alpha', ms: 2 * H }
    ])
    expect(tr.totals(H, 3 * H, 10 * H)).toEqual([
      { project: 'alpha', ms: H },
      { project: 'beta', ms: H }
    ])
    expect(tr.recentProjects()).toEqual(['beta', 'alpha'])
  })
  it('counts a running entry up to now', () => {
    const tr = timeRepo(openDb())
    tr.start('gamma', 0)
    expect(tr.totals(0, 100 * H, 2 * H)).toEqual([{ project: 'gamma', ms: 2 * H }])
    expect(tr.stop(3 * H)).toMatchObject({ project: 'gamma', endedAt: 3 * H })
    expect(tr.stop()).toBeNull()
  })
})

describe('quicklinks', () => {
  it('CRUD with case-insensitive unique keywords', () => {
    const q = quicklinksRepo(openDb())
    const j = q.create({ keyword: 'jira', name: 'Jira', url: 'https://x/browse/{query}' })
    expect(() => q.create({ keyword: 'JIRA', name: 'dup', url: 'https://y' })).toThrow()
    expect(q.update(j.id, { name: 'Jira tickets' }).name).toBe('Jira tickets')
    expect(q.list()).toHaveLength(1)
    expect(q.delete(j.id)).toBe(true)
  })
})
