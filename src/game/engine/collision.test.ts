import { describe, expect, it } from 'vitest'
import { circleFits, hasLineOfSight, moveWithCollision, raycast } from './collision.ts'
import { parseLevel } from '../world/level.ts'
import type { LevelSource } from '../world/types.ts'

/** 7x5 room, open interior, one pillar at (3,2). */
const src: LevelSource = {
  id: 'collision-fixture',
  name: 'Fixture',
  music: 'none',
  cellSize: 4,
  wallHeight: 4,
  floorTex: 'damp',
  ceilingTex: 'concrete',
  fog: 0,
  legend: { '#': { wall: 'brick' }, '.': { floor: true } },
  grid: ['#######', '#.....#', '#..#..#', '#.....#', '#######'],
  entities: [{ type: 'player', x: 1.5, z: 1.5 }],
  par: 0,
}
const level = parseLevel(src)
const R = 0.28

describe('circleFits', () => {
  it('fits in the middle of an open cell', () => {
    expect(circleFits(level, 1.5, 1.5, R)).toBe(true)
  })

  it('does not fit overlapping a wall', () => {
    expect(circleFits(level, 1.05, 1.5, R)).toBe(false)
  })

  it('checks every cell the circle straddles, not just the centre cell', () => {
    // Centre is in open cell (2,2); the circle's edge reaches into the pillar
    // at (3,2). Testing only the centre cell would call this a fit and let the
    // player's body sink into the pillar.
    expect(circleFits(level, 2.85, 2.5, R)).toBe(false)
  })

  it('catches a diagonal corner overlap', () => {
    // Near the pillar's top-left corner: no shared face, but the corner point
    // is inside the circle.
    expect(circleFits(level, 2.85, 1.85, R)).toBe(false)
  })

  it('allows a position that only just clears a corner', () => {
    expect(circleFits(level, 2.6, 1.6, R)).toBe(true)
  })
})

describe('moveWithCollision', () => {
  it('moves freely through open space', () => {
    const r = moveWithCollision(level, 2.5, 1.5, 0.2, 0, R)
    expect(r.x).toBeCloseTo(2.7, 6)
    expect(r.hitX).toBe(false)
  })

  it('stops flush against a wall instead of passing through', () => {
    const r = moveWithCollision(level, 5.5, 1.5, 5, 0, R)
    expect(r.hitX).toBe(true)
    expect(r.x).toBeLessThanOrEqual(6 - R)
    expect(r.x).toBeGreaterThan(5.5)
    expect(circleFits(level, r.x, r.z, R)).toBe(true)
  })

  it('slides along a wall rather than stopping dead', () => {
    // Diagonally into the north wall: x survives, z is cancelled.
    const r = moveWithCollision(level, 3.5, 1.4, 0.2, -0.3, R)
    expect(r.hitZ).toBe(true)
    expect(r.x).toBeCloseTo(3.7, 6)
  })

  it('never lands somewhere solid, from any position or direction', () => {
    for (let x = 1.1; x < 6; x += 0.17) {
      for (let z = 1.1; z < 4; z += 0.17) {
        if (!circleFits(level, x, z, R)) continue
        for (const [dx, dz] of [
          [0.4, 0],
          [-0.4, 0],
          [0, 0.4],
          [0, -0.4],
          [0.4, 0.4],
          [-0.4, -0.4],
          [0.4, -0.4],
          [-0.4, 0.4],
          [9, 9],
        ]) {
          const r = moveWithCollision(level, x, z, dx, dz, R)
          expect(
            circleFits(level, r.x, r.z, R),
            `ended solid from ${x.toFixed(2)},${z.toFixed(2)} moving ${dx},${dz}`,
          ).toBe(true)
        }
      }
    }
  })

  it('cannot tunnel through a wall with one huge step', () => {
    // The case a variable timestep would produce: a single frame's movement
    // larger than the wall is thick.
    const r = moveWithCollision(level, 1.5, 1.5, 0, 100, R)
    expect(circleFits(level, r.x, r.z, R)).toBe(true)
    expect(r.z).toBeLessThan(4)
  })
})

describe('raycast', () => {
  it('hits the wall straight ahead and reports the distance', () => {
    const hit = raycast(level, 1.5, 1.5, 1, 0)
    expect(hit).not.toBeNull()
    expect(hit!.cellX).toBe(6)
    expect(hit!.distance).toBeCloseTo(4.5, 6)
  })

  it('reports the face normal of the surface hit', () => {
    // Travelling +x into a wall: the face points back at -x.
    expect(raycast(level, 1.5, 1.5, 1, 0)!.normalX).toBe(-1)
    expect(raycast(level, 5.5, 1.5, -1, 0)!.normalX).toBe(1)
    expect(raycast(level, 1.5, 3.5, 0, 1)!.normalZ).toBe(-1)
    expect(raycast(level, 1.5, 1.5, 0, -1)!.normalZ).toBe(1)
  })

  it('hits the pillar rather than the far wall', () => {
    const hit = raycast(level, 1.5, 2.5, 1, 0)
    expect(hit!.cellX).toBe(3)
    expect(hit!.distance).toBeCloseTo(1.5, 6)
  })

  it('returns null when nothing is hit within range', () => {
    expect(raycast(level, 1.5, 1.5, 1, 0, 1)).toBeNull()
  })

  it('handles a purely axis-aligned ray without producing NaN', () => {
    // rdx of exactly 0 gives 0/0 = NaN if the delta is not guarded, and every
    // comparison against NaN is false, so the loop would run to maxDistance.
    const hit = raycast(level, 1.5, 1.5, 0, 1)
    expect(hit).not.toBeNull()
    expect(Number.isNaN(hit!.distance)).toBe(false)
    expect(hit!.cellZ).toBe(4)
  })

  it('rejects a zero-length direction instead of looping forever', () => {
    expect(raycast(level, 1.5, 1.5, 0, 0)).toBeNull()
  })

  it('reports distance 0 when starting inside a wall', () => {
    const hit = raycast(level, 0.5, 0.5, 1, 0)
    expect(hit!.distance).toBe(0)
  })

  it('is unaffected by the direction vector not being normalised', () => {
    const a = raycast(level, 1.5, 1.5, 1, 0)!
    const b = raycast(level, 1.5, 1.5, 37, 0)!
    expect(b.distance).toBeCloseTo(a.distance, 9)
    expect(b.cellX).toBe(a.cellX)
  })

  it('does not step past a corner diagonally', () => {
    // A 45-degree ray at a corner must hit the pillar, not slip between cells.
    const hit = raycast(level, 2.5, 1.5, 1, 1)
    expect(hit).not.toBeNull()
    expect(hit!.distance).toBeLessThan(4)
  })
})

describe('hasLineOfSight', () => {
  it('sees across open floor', () => {
    expect(hasLineOfSight(level, 1.5, 1.5, 5.5, 1.5)).toBe(true)
  })

  it('is blocked by the pillar', () => {
    expect(hasLineOfSight(level, 1.5, 2.5, 5.5, 2.5)).toBe(false)
  })

  it('is symmetric', () => {
    expect(hasLineOfSight(level, 1.5, 2.5, 5.5, 2.5)).toBe(
      hasLineOfSight(level, 5.5, 2.5, 1.5, 2.5),
    )
  })

  it('sees itself', () => {
    expect(hasLineOfSight(level, 2.5, 2.5, 2.5, 2.5)).toBe(true)
  })
})
