import { describe, expect, it } from 'vitest'
import { moveVector, type Action } from './input.ts'

const holding =
  (...down: Action[]) =>
  (a: Action) =>
    down.includes(a)

describe('moveVector', () => {
  it('is zero with nothing held', () => {
    expect(moveVector(holding())).toEqual({ x: 0, z: 0 })
  })

  it('is unit length on a cardinal', () => {
    expect(moveVector(holding('forward'))).toEqual({ x: 0, z: 1 })
    expect(moveVector(holding('back'))).toEqual({ x: 0, z: -1 })
    expect(moveVector(holding('right'))).toEqual({ x: 1, z: 0 })
    expect(moveVector(holding('left'))).toEqual({ x: -1, z: 0 })
  })

  it('normalises diagonals so strafe-running is not faster', () => {
    // Unnormalised this is length 1.414 -- the original Quake strafe-run bug,
    // and a one-character regression away at any time.
    const v = moveVector(holding('forward', 'right'))
    expect(Math.hypot(v.x, v.z)).toBeCloseTo(1, 9)
  })

  it('cancels opposing keys', () => {
    expect(moveVector(holding('forward', 'back'))).toEqual({ x: 0, z: 0 })
    expect(moveVector(holding('left', 'right'))).toEqual({ x: 0, z: 0 })
  })

  it('is never longer than unit length for any combination', () => {
    const all: Action[] = ['forward', 'back', 'left', 'right']
    for (let mask = 0; mask < 16; mask++) {
      const held = all.filter((_, i) => mask & (1 << i))
      const v = moveVector(holding(...held))
      expect(Math.hypot(v.x, v.z)).toBeLessThanOrEqual(1 + 1e-9)
    }
  })
})
