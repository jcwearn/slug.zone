import { describe, expect, it } from 'vitest'
import { worldSpace } from './space.ts'
import { parseLevel } from './level.ts'
import { buildLevelBuffers } from './geometry.ts'
import { EYE_HEIGHT } from '../player/controller.ts'
import e1m1 from './levels/e1m1.ts'

const level = parseLevel(e1m1)
const space = worldSpace(level)

describe('worldSpace', () => {
  it('scales the horizontal axes by cellSize', () => {
    expect(space.toWorldXZ(3)).toBe(3 * level.cellSize)
  })

  it('does NOT scale the vertical axis by cellSize', () => {
    // The bug: Y scaled as well put the eye at 8.8 in a room 4 tall.
    expect(space.ceilingY).toBe(level.wallHeight)
    expect(space.ceilingY).not.toBe(level.wallHeight * level.cellSize)
  })

  it('keeps the eye inside the room across the full head-bob range', () => {
    for (const bob of [-0.05, 0, 0.05]) {
      const y = space.eyeY(EYE_HEIGHT + bob)
      expect(y).toBeGreaterThan(space.floorY)
      expect(y).toBeLessThan(space.ceilingY)
    }
  })

  it('agrees with the geometry actually built for the level', () => {
    // The real assertion. Two files disagreeing about what a unit means is what
    // caused the bug, so this asks the mesh builder what it actually produced
    // and checks the space describes the same room -- rather than restating a
    // constant, which would agree with itself no matter how wrong it was.
    const batches = buildLevelBuffers(level)
    let minY = Infinity
    let maxY = -Infinity
    let minXZ = Infinity
    let maxXZ = -Infinity

    for (const batch of batches.values()) {
      for (let i = 0; i < batch.positions.length; i += 3) {
        const x = batch.positions[i]
        const y = batch.positions[i + 1]
        const z = batch.positions[i + 2]
        minY = Math.min(minY, y)
        maxY = Math.max(maxY, y)
        minXZ = Math.min(minXZ, x, z)
        maxXZ = Math.max(maxXZ, x, z)
      }
    }

    expect(minY).toBe(space.floorY)
    expect(maxY).toBe(space.ceilingY)
    // Not 0: the outermost wall ring only emits its INNER face, because faces
    // are drawn where solid meets open. So the extents sit one cell inside the
    // grid bounds, and what matters is that they land on cell boundaries.
    expect(minXZ).toBeGreaterThanOrEqual(space.toWorldXZ(0))
    expect(maxXZ).toBeLessThanOrEqual(space.toWorldXZ(Math.max(level.width, level.height)))
    expect(minXZ % level.cellSize).toBe(0)
    expect(maxXZ % level.cellSize).toBe(0)
  })

  it('puts the eye well inside the geometry the builder emits', () => {
    // The shipped bug in one assertion: the eye was at 8.8 and the tallest
    // vertex was 4.
    const batches = buildLevelBuffers(level)
    let maxY = -Infinity
    for (const batch of batches.values()) {
      for (let i = 1; i < batch.positions.length; i += 3) {
        maxY = Math.max(maxY, batch.positions[i])
      }
    }
    expect(space.eyeY(EYE_HEIGHT)).toBeLessThan(maxY)
  })
})
