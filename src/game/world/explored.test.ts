import { describe, expect, it } from 'vitest'
import { createExplored, isExplored, resetExplored, REVEAL_RADIUS, revealFrom } from './explored.ts'
import { buildDoors, tickDoors, tryOpen } from './doors.ts'
import { isSolid, parseLevel, type Level } from './level.ts'
import type { LevelSource } from './types.ts'
import e1m1 from './levels/e1m1.ts'

/** Fraction of the chartable cells that have been charted. */
function charted(explored: ReturnType<typeof createExplored>, level: Level): number {
  const real = level.cells.filter((c) => !c.void)
  const found = real.filter((c) => isExplored(explored, c.x, c.z))
  return real.length === 0 ? 1 : found.length / real.length
}

const source = (grid: string[]): LevelSource => ({
  id: 'fog',
  name: 'Fog',
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
  grid,
  entities: [{ type: 'player', x: 1.5, z: 1.5 }],
  par: 1000,
})

describe('revealFrom', () => {
  it('charts nothing until it is asked to', () => {
    const level = parseLevel(source(['#####', '#...#', '#####']))
    const explored = createExplored(level)
    expect(charted(explored, level)).toBe(0)
  })

  it('charts the cell underfoot', () => {
    const level = parseLevel(source(['#####', '#...#', '#####']))
    const explored = createExplored(level)
    revealFrom(level, explored, 1.5, 1.5)
    expect(isExplored(explored, 1, 1)).toBe(true)
  })

  it('charts the walls around the room it charts', () => {
    // Line of sight to a wall's own centre is blocked by that wall, so a sweep
    // that only marked what it could see would draw every corridor as a strip
    // of floor with no edges at all.
    const level = parseLevel(source(['#####', '#...#', '#####']))
    const explored = createExplored(level)
    revealFrom(level, explored, 2.5, 1.5)
    for (const [x, z] of [
      [1, 0],
      [2, 0],
      [3, 0],
      [1, 2],
      [2, 2],
      [3, 2],
    ]) {
      expect(isExplored(explored, x, z), `wall ${x},${z}`).toBe(true)
    }
  })

  it('closes the corners, not just the sides', () => {
    const level = parseLevel(source(['#####', '#...#', '#...#', '#####']))
    const explored = createExplored(level)
    revealFrom(level, explored, 2.5, 1.5)
    expect(isExplored(explored, 0, 0), 'the corner block').toBe(true)
  })

  it('does not chart through a wall', () => {
    // The whole point of the fog. Radius alone would map the next room.
    const level = parseLevel(source(['#######', '#..#..#', '#######']))
    const explored = createExplored(level)
    revealFrom(level, explored, 1.5, 1.5)
    expect(isExplored(explored, 1, 1), 'the room the player is in').toBe(true)
    expect(isExplored(explored, 4, 1), 'the room behind the wall').toBe(false)
    expect(isExplored(explored, 5, 1), 'and the rest of it').toBe(false)
  })

  it('does not chart past its own radius', () => {
    const wide = ['#'.repeat(24), `#${'.'.repeat(22)}#`, '#'.repeat(24)]
    const level = parseLevel(source(wide))
    const explored = createExplored(level)
    revealFrom(level, explored, 1.5, 1.5)

    const inside = Math.floor(1.5 + REVEAL_RADIUS - 1)
    const outside = Math.ceil(1.5 + REVEAL_RADIUS + 2)
    expect(isExplored(explored, inside, 1), `${inside} is inside the radius`).toBe(true)
    expect(isExplored(explored, outside, 1), `${outside} is beyond it`).toBe(false)
  })

  it('never charts void', () => {
    // Void is outside the map and never drawn in the world. Drawing it on the
    // map would trace the outline of rooms nobody has been in.
    const level = parseLevel(source(['## ##', '#...#', '#####']))
    const explored = createExplored(level)
    revealFrom(level, explored, 2.5, 1.5)
    expect(isExplored(explored, 2, 0)).toBe(false)
  })

  it('does not sweep again until the player has moved', () => {
    // The sweep is well over a hundred raycasts. Standing still must not pay
    // for it sixty times a second to get the same answer back.
    //
    // Asserted on the sweep's own origin, not on its return value. A skipped
    // sweep and a sweep that ran and found nothing new BOTH return 0, so a
    // test that only checked the count passed just as happily with the gate
    // deleted -- which is exactly the cost this is supposed to be avoiding.
    const level = parseLevel(source(['#########', '#.......#', '#########']))
    const explored = createExplored(level)

    revealFrom(level, explored, 1.5, 1.5)
    expect([explored.lastX, explored.lastZ]).toEqual([1.5, 1.5])

    expect(revealFrom(level, explored, 1.6, 1.5)).toBe(0)
    expect([explored.lastX, explored.lastZ], 'a shuffle must not resweep').toEqual([1.5, 1.5])

    revealFrom(level, explored, 2.5, 1.5)
    expect([explored.lastX, explored.lastZ], 'a real step must').toEqual([2.5, 1.5])
  })

  it('sweeps again once the player has gone somewhere', () => {
    // Longer than the reveal radius on purpose: in a corridor the first sweep
    // already charts end to end, walking down it finds nothing new and this
    // would pass whether or not the sweep ran at all.
    const long = ['#'.repeat(24), `#${'.'.repeat(22)}#`, '#'.repeat(24)]
    const level = parseLevel(source(long))
    const explored = createExplored(level)
    revealFrom(level, explored, 1.5, 1.5)
    expect(revealFrom(level, explored, 12.5, 1.5)).toBeGreaterThan(0)
  })

  it('charts a closed door, so you can see there is one', () => {
    const level = parseLevel(source(['#####', '#.D.#', '#####']))
    const explored = createExplored(level)
    revealFrom(level, explored, 1.5, 1.5)
    expect(isExplored(explored, 2, 1)).toBe(true)
    expect(isExplored(explored, 3, 1), 'the far side is still hidden').toBe(false)
  })

  it('charts what a door opens onto once it is open', () => {
    const level = parseLevel(source(['#####', '#.D.#', '#####']))
    const doors = buildDoors(level)
    const explored = createExplored(level)
    revealFrom(level, explored, 1.5, 1.5)
    expect(isExplored(explored, 3, 1)).toBe(false)

    tryOpen(doors, 2, 1, new Set())
    for (let t = 0; t < 2; t += 1 / 60) tickDoors(doors, level, 1 / 60)

    // Moved far enough to force a fresh sweep.
    revealFrom(level, explored, 1.9, 1.5)
    expect(isExplored(explored, 3, 1)).toBe(true)
  })
})

describe('resetExplored', () => {
  it('puts the fog back for another run', () => {
    const level = parseLevel(source(['#####', '#...#', '#####']))
    const explored = createExplored(level)
    revealFrom(level, explored, 1.5, 1.5)
    expect(charted(explored, level)).toBeGreaterThan(0)

    resetExplored(explored)
    expect(charted(explored, level)).toBe(0)
    // And the next sweep must run rather than being skipped as "not moved".
    expect(revealFrom(level, explored, 1.5, 1.5)).toBeGreaterThan(0)
  })
})

describe('e1m1', () => {
  const level = parseLevel(e1m1)

  /** Every cell a player can stand in, with every door opened. */
  function walkable(open: Level): [number, number][] {
    const doors = buildDoors(open)
    for (const door of doors) tryOpen(doors, door.x, door.z, new Set(['red']))
    for (let t = 0; t < 2; t += 1 / 60) tickDoors(doors, open, 1 / 60)
    return open.cells.filter((c) => !isSolid(open, c.x, c.z)).map((c) => [c.x, c.z])
  }

  it('is fully charted by a player who walks all of it', () => {
    // The property that matters and cannot be eyeballed: no corner of the map
    // is impossible to chart. A reveal rule that misses one leaves a hole the
    // player cannot fill no matter how long they look for it.
    const explored = createExplored(level)
    const cells = walkable(level)

    for (const [x, z] of cells) {
      // Forced past the resweep gate by stepping between distant cells.
      explored.primed = false
      revealFrom(level, explored, x + 0.5, z + 0.5)
    }

    const missing = level.cells
      .filter((c) => !c.void && !isExplored(explored, c.x, c.z))
      .map((c) => `${c.x},${c.z}`)
    expect(missing, 'cells that can never be charted').toEqual([])
    expect(charted(explored, level)).toBe(1)
  })

  it('leaves most of the map dark from the spawn', () => {
    // If standing still charted most of the level there would be nothing for
    // the fog to do.
    const explored = createExplored(level)
    revealFrom(level, explored, level.playerStart.x, level.playerStart.z)
    expect(charted(explored, level)).toBeLessThan(0.25)
  })
})
