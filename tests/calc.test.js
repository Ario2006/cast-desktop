import { describe, expect, it } from 'vitest'
import { convertUnits, evaluateMath, looksLikeMath } from '../src/shared/calc.js'

describe('evaluateMath', () => {
  it.each([
    ['12*(3+4)', 84],
    ['15% of 240', 36],
    ['sqrt(81)', 9],
    ['2^10', 1024],
    ['1,000 * 2', 2000],
    ['calc 7 * 6', 42],
    ['= 10 / 4', 2.5],
    ['(1 + 2) * 3 - 4', 5],
    ['5 - 3', 2]
  ])('%s = %d', (input, value) => {
    expect(evaluateMath(input)?.value).toBeCloseTo(value)
  })

  it('formats without floating-point noise', () => {
    expect(evaluateMath('0.1 + 0.2')?.display).toBe('0.3')
  })

  it('ignores things that are not calculations', () => {
    for (const q of ['25', 'hello world', '2024-05-01', 'pi', '', 'timer 5m', '5 miles in km']) {
      expect(evaluateMath(q), q).toBeNull()
    }
  })

  it('returns null for non-finite results', () => {
    expect(evaluateMath('1/0')).toBeNull()
  })

  it('cannot reach dangerous mathjs functions', () => {
    for (const q of [
      'import({a: 1}, {override: true})',
      'evaluate("1+1")',
      'parse("1+1")',
      'createUnit("foo")',
      'simplify("x+x")',
      'derivative("x^2", "x")'
    ]) {
      expect(looksLikeMath(q), q).toBe(false)
      expect(evaluateMath(q), q).toBeNull()
    }
  })

  it('refuses very long input', () => {
    expect(evaluateMath('1+'.repeat(150) + '1')).toBeNull()
  })
})

describe('convertUnits', () => {
  it('converts length', () => {
    expect(convertUnits('5 miles in km')?.value).toBeCloseTo(8.04672)
    expect(convertUnits('5 miles in km')?.text).toBe('8.04672 km')
    expect(convertUnits('10 km to miles')?.value).toBeCloseTo(6.2137, 3)
  })
  it('converts temperature with degree labels', () => {
    expect(convertUnits('100 f to c')?.text).toMatch(/^37\.7777\d*°C$/)
    expect(convertUnits('72f in c')?.value).toBeCloseTo(22.2222, 3)
    expect(convertUnits('0 c to f')?.value).toBeCloseTo(32)
  })
  it('converts volume, mass, speed and data', () => {
    expect(convertUnits('2 cups to ml')?.value).toBeCloseTo(473.18, 1)
    expect(convertUnits('5 lbs to kg')?.value).toBeCloseTo(2.268, 2)
    expect(convertUnits('60 mph to km/h')?.value).toBeCloseTo(96.56, 1)
    expect(convertUnits('1 hour in minutes')?.value).toBe(60)
  })
  it('returns null for incompatible or unknown units and non-conversions', () => {
    expect(convertUnits('5 miles in kg')).toBeNull()
    expect(convertUnits('5 zorps in km')).toBeNull()
    expect(convertUnits('hello world')).toBeNull()
    expect(convertUnits('25m')).toBeNull()
  })
})
