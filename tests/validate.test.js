import { describe, expect, it } from 'vitest'
import * as s from '../src/shared/validate.js'

describe('validators', () => {
  it('str enforces type and length', () => {
    expect(s.validate(s.str(5), 'abc')).toBe('abc')
    expect(() => s.validate(s.str(2), 'abc')).toThrow(/too long/)
    expect(() => s.validate(s.str(5, 1), '')).toThrow(/too short/)
    expect(() => s.validate(s.str(5), 12)).toThrow(/expected string/)
  })

  it('num/int reject NaN, Infinity and out-of-range', () => {
    expect(() => s.validate(s.num(), NaN)).toThrow()
    expect(() => s.validate(s.num(), Infinity)).toThrow()
    expect(() => s.validate(s.int(1, 5), 1.5)).toThrow()
    expect(() => s.validate(s.int(1, 5), 6)).toThrow(/out of range/)
    expect(s.validate(s.int(1, 5), 3)).toBe(3)
  })

  it('obj drops unknown keys, keeps optional ones undefined, and reports the path', () => {
    const v = s.obj({ a: s.str(10), b: s.opt(s.int()) })
    expect(s.validate(v, { a: 'x', extra: 1 })).toEqual({ a: 'x' })
    expect(() => s.validate(v, { a: 1 })).toThrow(/value\.a/)
    expect(() => s.validate(v, null)).toThrow(/expected object/)
    expect(() => s.validate(v, [])).toThrow(/expected object/)
    expect(() => s.validate(s.obj({}, { strict: true }), { z: 1 })).toThrow(/unknown key/)
  })

  it('arr caps size and validates items', () => {
    expect(s.validate(s.arr(s.int(), 2), [1, 2])).toEqual([1, 2])
    expect(() => s.validate(s.arr(s.int(), 2), [1, 2, 3])).toThrow(/too many/)
    expect(() => s.validate(s.arr(s.int()), ['x'])).toThrow(/\[0\]/)
  })

  it('isoDate accepts ISO strings only', () => {
    expect(s.validate(s.isoDate, '2026-10-22T10:00:00+05:30')).toBeTruthy()
    expect(() => s.validate(s.isoDate, 'not a date')).toThrow()
    expect(() => s.validate(s.isoDate, 12345)).toThrow()
  })

  it('safe converts ValidationError to a result object', () => {
    expect(s.safe(s.str(), 1)).toMatchObject({ ok: false })
    expect(s.safe(s.str(), 'a')).toEqual({ ok: true, value: 'a' })
  })
})
