import { describe, expect, it } from 'vitest'
import { angleDelta, clamp, lerp, mulberry32, range, rangeInt } from './math.ts'

describe('mulberry32', () => {
  it('is reproducible for a given seed', () => {
    const a = mulberry32(1234)
    const b = mulberry32(1234)
    const seqA = Array.from({ length: 16 }, a)
    const seqB = Array.from({ length: 16 }, b)
    expect(seqA).toEqual(seqB)
  })

  it('gives different streams for different seeds', () => {
    const a = Array.from({ length: 8 }, mulberry32(1))
    const b = Array.from({ length: 8 }, mulberry32(2))
    expect(a).not.toEqual(b)
  })

  it('stays within [0, 1)', () => {
    const rng = mulberry32(99)
    for (let i = 0; i < 5000; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('survives a seed of 0 rather than degenerating', () => {
    const rng = mulberry32(0)
    const values = new Set(Array.from({ length: 32 }, rng))
    expect(values.size).toBeGreaterThan(30)
  })
})

describe('rangeInt', () => {
  it('is inclusive of both bounds', () => {
    const rng = mulberry32(7)
    const seen = new Set<number>()
    for (let i = 0; i < 2000; i++) seen.add(rangeInt(rng, 1, 3))
    expect([...seen].sort()).toEqual([1, 2, 3])
  })

  it('maps the extreme draws to the extreme bounds', () => {
    expect(rangeInt(() => 0, 5, 9)).toBe(5)
    expect(rangeInt(() => 0.9999999, 5, 9)).toBe(9)
  })
})

describe('range', () => {
  it('spans min inclusive to max exclusive', () => {
    expect(range(() => 0, 2, 6)).toBe(2)
    expect(range(() => 0.5, 2, 6)).toBe(4)
  })
})

describe('clamp', () => {
  it('bounds on both sides and passes through the middle', () => {
    expect(clamp(-5, 0, 10)).toBe(0)
    expect(clamp(15, 0, 10)).toBe(10)
    expect(clamp(5, 0, 10)).toBe(5)
  })
})

describe('lerp', () => {
  it('hits both endpoints exactly', () => {
    expect(lerp(10, 20, 0)).toBe(10)
    expect(lerp(10, 20, 1)).toBe(20)
    expect(lerp(10, 20, 0.25)).toBe(12.5)
  })
})

describe('angleDelta', () => {
  const PI = Math.PI

  it('is zero for equal angles', () => {
    expect(angleDelta(1, 1)).toBe(0)
  })

  it('takes the short way across the +/-PI wrap', () => {
    // 10 degrees below PI to 10 degrees above -PI is 20 degrees, not 340.
    const a = PI - 0.1745
    const b = -PI + 0.1745
    expect(angleDelta(a, b)).toBeCloseTo(0.349, 3)
  })

  it('signs correctly in both directions', () => {
    expect(angleDelta(0, 0.5)).toBeCloseTo(0.5, 6)
    expect(angleDelta(0, -0.5)).toBeCloseTo(-0.5, 6)
  })

  it('always lands within (-PI, PI]', () => {
    for (let i = -20; i <= 20; i++) {
      for (let j = -20; j <= 20; j++) {
        const d = angleDelta(i * 0.7, j * 0.7)
        expect(d).toBeGreaterThan(-PI - 1e-9)
        expect(d).toBeLessThanOrEqual(PI + 1e-9)
      }
    }
  })
})
