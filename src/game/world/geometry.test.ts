import { describe, expect, it } from 'vitest'
import { buildLevelBuffers } from './geometry.ts'
import { parseLevel, type Level } from './level.ts'
import type { LevelSource } from './types.ts'
import e1m1 from './levels/e1m1.ts'

/**
 * What the static mesh must contain once doors can open.
 *
 * Both properties here are invisible until a door actually rises, and by then
 * they look like two different bugs: a hole in the floor you fall through the
 * look of, and a view into the hollow interior of the wall beside the doorway.
 * They have one cause -- face culling asking `isSolid`, which counts a door as
 * solid because collision needs it to be.
 *
 * Everything is derived from the parsed level rather than from a count written
 * down here, or the test would agree with itself no matter what changed.
 */

const source: LevelSource = {
  id: 'geo',
  name: 'Geometry',
  music: 'none',
  cellSize: 4,
  wallHeight: 4,
  floorTex: 'damp',
  ceilingTex: 'concrete',
  fog: 0.05,
  legend: {
    '#': { wall: 'brick' },
    '.': { floor: true },
    ' ': { void: true },
    D: { door: { key: null } },
    S: { secretWall: 'brick' },
    X: { exit: true },
  },
  //  A door and a secret, each with a wall jamb above and below.
  grid: ['#######', '#.#.#.#', '#.D.S.X', '#.#.#.#', '#######'],
  entities: [{ type: 'player', x: 1.5, z: 2.5 }],
  par: 1000,
}

type Batches = Map<string, { positions: number[]; normals: number[] }>

/** Every quad as its four corners, flattened out of the batches. */
function quads(batches: Batches) {
  const out: { normal: [number, number, number]; corners: [number, number, number][] }[] = []
  for (const batch of batches.values()) {
    for (let q = 0; q * 12 < batch.positions.length; q++) {
      const corners: [number, number, number][] = []
      for (let c = 0; c < 4; c++) {
        const i = q * 12 + c * 3
        corners.push([batch.positions[i], batch.positions[i + 1], batch.positions[i + 2]])
      }
      const n = q * 12
      out.push({
        normal: [batch.normals[n], batch.normals[n + 1], batch.normals[n + 2]],
        corners,
      })
    }
  }
  return out
}

/** Cells a body could ever stand in: floor, exit, and under a lifted leaf. */
function standable(level: Level) {
  return level.cells.filter((c) => c.floor ?? c.exit ?? c.door ?? c.secretWall)
}

describe.each([
  ['the fixture', source],
  ['e1m1', e1m1],
])('%s', (_name, src) => {
  const level = parseLevel(src)
  const s = level.cellSize
  const h = level.wallHeight
  const all = quads(buildLevelBuffers(level) as Batches)

  const horizontal = (y: number, up: boolean) =>
    all.filter((q) => q.normal[1] === (up ? 1 : -1) && q.corners.every((c) => c[1] === y))

  it('floors every cell a body can stand in, doors and secrets included', () => {
    // Without this a door opens onto a hole in the world: the cell is solid at
    // build time, so it never took the floor-and-ceiling branch at all.
    const floors = horizontal(0, true)
    const covered = new Set(
      floors.map((q) => {
        const x = Math.min(...q.corners.map((c) => c[0])) / s
        const z = Math.min(...q.corners.map((c) => c[2])) / s
        return `${x},${z}`
      }),
    )
    const missing = standable(level)
      .filter((c) => !covered.has(`${c.x},${c.z}`))
      .map((c) => `${c.x},${c.z}`)
    expect(missing, 'standable cells with no floor under them').toEqual([])
    expect(floors).toHaveLength(standable(level).length)
  })

  it('ceilings every one of them too', () => {
    expect(horizontal(h, false)).toHaveLength(standable(level).length)
  })

  it('walls the jambs beside every door and secret', () => {
    // The other half of the same bug. A wall next to a door culls its face
    // against it, so lifting the leaf exposes the inside of the wall block --
    // unlit, backfacing, and a straight view through to whatever is beyond.
    const leaves = level.cells.filter((c) => c.door ?? c.secretWall)
    const naked: string[] = []

    for (const leaf of leaves) {
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = leaf.x + dx
        const nz = leaf.z + dz
        const neighbour = level.cells.find((c) => c.x === nx && c.z === nz)
        if (!neighbour?.wall) continue

        // The face the wall must present across the boundary it shares with
        // the leaf: right plane, right normal, AND spanning the right cell.
        //
        // Pinning the plane alone is not enough -- a plane is infinite, and
        // any wall anywhere along z=8 would satisfy a check that only asked
        // for z=8. That version of this test passed happily while the jamb
        // beside the door had no face at all.
        const faced = all.some((q) => {
          if (q.normal[0] !== -dx || q.normal[2] !== -dz) return false
          const plane = dx !== 0 ? (dx > 0 ? nx : nx + 1) * s : (dz > 0 ? nz : nz + 1) * s
          const axis = dx !== 0 ? 0 : 2
          const across = dx !== 0 ? 2 : 0
          if (!q.corners.every((c) => c[axis] === plane)) return false
          // The quad must cover the leaf's own span on the other axis, not
          // some other cell's.
          const lo = (across === 0 ? leaf.x : leaf.z) * s
          const hi = lo + s
          return (
            Math.min(...q.corners.map((c) => c[across])) === lo &&
            Math.max(...q.corners.map((c) => c[across])) === hi
          )
        })
        if (!faced) naked.push(`wall ${nx},${nz} toward leaf ${leaf.x},${leaf.z}`)
      }
    }

    expect(naked, 'jambs with no face toward the doorway').toEqual([])
  })

  it('leaves the moving parts out of the merged batches', () => {
    // A face merged in here cannot be animated, and the leaves have to move.
    const batches = buildLevelBuffers(level) as Batches
    expect([...batches.keys()]).not.toContain('door')
  })

  it('emits nothing at all for void', () => {
    const extent = (i: 0 | 2) => all.flatMap((q) => q.corners.map((c) => c[i]))
    for (const c of extent(0)) expect(c).toBeGreaterThanOrEqual(0)
    for (const c of extent(2)) expect(c).toBeGreaterThanOrEqual(0)
    // Nothing above the ceiling or below the floor, ever.
    for (const q of all) for (const c of q.corners) expect(c[1]).toBeGreaterThanOrEqual(0)
    for (const q of all) for (const c of q.corners) expect(c[1]).toBeLessThanOrEqual(h)
  })
})
