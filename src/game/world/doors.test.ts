import { describe, expect, it } from 'vitest'
import {
  buildDoors,
  doorAt,
  OPEN_TIME,
  PASSABLE_AT,
  resetDoors,
  tickDoors,
  tryOpen,
  USE_RANGE,
  useTarget,
} from './doors.ts'
import { isSolid, parseLevel, type Level } from './level.ts'
import { hasLineOfSight, moveWithCollision } from '../engine/collision.ts'
import type { LevelSource } from './types.ts'
import e1m1 from './levels/e1m1.ts'

const base: LevelSource = {
  id: 'doors',
  name: 'Doors',
  music: 'none',
  cellSize: 4,
  wallHeight: 4,
  floorTex: 'damp',
  ceilingTex: 'concrete',
  fog: 0.05,
  legend: {
    '#': { wall: 'brick' },
    '.': { floor: true },
    D: { door: { key: null } },
    R: { door: { key: 'red' } },
    S: { secretWall: 'brick' },
  },
  grid: ['#####', '#.D.#', '#.R.#', '#.S.#', '#####'],
  entities: [{ type: 'player', x: 1.5, z: 1.5 }],
  par: 1000,
}

const world = (): { level: Level; doors: ReturnType<typeof buildDoors> } => {
  const level = parseLevel(base)
  return { level, doors: buildDoors(level) }
}

const STEP = 1 / 60

/** Run the clock until a door has finished opening. */
function openFully(level: Level, doors: ReturnType<typeof buildDoors>): void {
  for (let t = 0; t <= OPEN_TIME + STEP; t += STEP) tickDoors(doors, level, STEP)
}

describe('buildDoors', () => {
  it('finds every door and every secret wall', () => {
    const { doors } = world()
    expect(doors).toHaveLength(3)
    expect(doors.filter((d) => d.secret)).toHaveLength(1)
  })

  it('carries the keycard a door is gated on', () => {
    const { doors } = world()
    expect(doorAt(doors, 2, 1)?.key).toBeNull()
    expect(doorAt(doors, 2, 2)?.key).toBe('red')
  })

  it('gives a secret the texture of the wall it is hiding among', () => {
    // A secret you can pick out from the brick around it is not one.
    const { doors } = world()
    expect(doorAt(doors, 2, 3)?.texture).toBe('brick')
    expect(doorAt(doors, 2, 1)?.texture).toBe('door')
  })

  it('starts everything shut', () => {
    const { level, doors } = world()
    expect(doors.every((d) => d.phase === 'closed' && d.openness === 0)).toBe(true)
    expect(isSolid(level, 2, 1)).toBe(true)
  })
})

describe('tryOpen', () => {
  it('refuses a keyed door to someone without the card', () => {
    const { doors } = world()
    const result = tryOpen(doors, 2, 2, new Set())
    expect(result.outcome).toBe('locked')
    expect(doorAt(doors, 2, 2)?.phase).toBe('closed')
  })

  it('opens the same door once the card is held', () => {
    const { doors } = world()
    expect(tryOpen(doors, 2, 2, new Set(['red'])).outcome).toBe('opened')
    expect(doorAt(doors, 2, 2)?.phase).toBe('opening')
  })

  it('is not fooled by holding the wrong card', () => {
    const { doors } = world()
    expect(tryOpen(doors, 2, 2, new Set(['blue', 'yellow'])).outcome).toBe('locked')
  })

  it('opens an unkeyed door to someone holding nothing', () => {
    // `key: null` must not be treated as a key named "null".
    const { doors } = world()
    expect(tryOpen(doors, 2, 1, new Set()).outcome).toBe('opened')
  })

  it('reports a second use as already open, so a secret cannot be counted twice', () => {
    const { doors } = world()
    expect(tryOpen(doors, 2, 3, new Set()).outcome).toBe('opened')
    expect(tryOpen(doors, 2, 3, new Set()).outcome).toBe('already')
  })

  it('says nothing at all about a plain wall', () => {
    // Distinct from 'locked': a wall that grunts every time you press use is
    // worse than one that ignores you.
    const { doors } = world()
    expect(tryOpen(doors, 0, 0, new Set()).outcome).toBe('none')
  })
})

describe('tickDoors', () => {
  it('lets you through partway up rather than at the very top', () => {
    // Waiting for the animation to finish means bouncing off a door that has
    // visibly opened, which reads as the door being broken.
    const { level, doors } = world()
    tryOpen(doors, 2, 1, new Set())

    tickDoors(doors, level, OPEN_TIME * (PASSABLE_AT - 0.05))
    expect(isSolid(level, 2, 1), 'solid below the passable threshold').toBe(true)

    tickDoors(doors, level, OPEN_TIME * 0.1)
    expect(isSolid(level, 2, 1), 'open above it').toBe(false)
  })

  it('never drives a leaf past fully open', () => {
    const { level, doors } = world()
    tryOpen(doors, 2, 1, new Set())
    tickDoors(doors, level, OPEN_TIME * 10)
    expect(doorAt(doors, 2, 1)?.openness).toBe(1)
    expect(doorAt(doors, 2, 1)?.phase).toBe('open')
  })

  it('leaves a shut door shut no matter how long it runs', () => {
    const { level, doors } = world()
    openFully(level, doors)
    expect(isSolid(level, 2, 2), 'the red door nobody opened').toBe(true)
  })

  it('reaches collision, the raycast and line of sight all at once', () => {
    // The point of putting the flag on the Cell: everything that cares about
    // solidity already funnels through isSolid, so one write serves all three.
    const { level, doors } = world()

    expect(hasLineOfSight(level, 1.5, 1.5, 3.5, 1.5)).toBe(false)
    const blocked = moveWithCollision(level, 1.5, 1.5, 2, 0)
    expect(blocked.hitX).toBe(true)
    expect(blocked.x).toBeLessThan(2)

    tryOpen(doors, 2, 1, new Set())
    openFully(level, doors)

    expect(hasLineOfSight(level, 1.5, 1.5, 3.5, 1.5)).toBe(true)
    const through = moveWithCollision(level, 1.5, 1.5, 2, 0)
    expect(through.hitX).toBe(false)
    expect(through.x).toBeCloseTo(3.5, 6)
  })
})

describe('resetDoors', () => {
  it('shuts everything and clears the level, not just the door records', () => {
    // `cell.open` survives a restart because the Level object is reused --
    // rebuilding it would regenerate every texture. Forget this and the second
    // run starts with every door standing wide open.
    const { level, doors } = world()
    tryOpen(doors, 2, 1, new Set())
    openFully(level, doors)
    expect(isSolid(level, 2, 1)).toBe(false)

    resetDoors(doors, level)
    expect(isSolid(level, 2, 1)).toBe(true)
    expect(doorAt(doors, 2, 1)?.phase).toBe('closed')
  })
})

describe('door state is per-level, not per-legend', () => {
  it('opening a door in one parse leaves the other shut', () => {
    // parseLevel copies the legend spec, and a shallow copy hands every door
    // cell in the level the SAME `door` object -- the one the level module
    // exports, which outlives the parse. State written there opens every door
    // in the game at once and leaks into the next test in the file.
    const a = parseLevel(base)
    const b = parseLevel(base)
    const doorsA = buildDoors(a)

    tryOpen(doorsA, 2, 1, new Set())
    openFully(a, doorsA)

    expect(isSolid(a, 2, 1), 'the door that was opened').toBe(false)
    expect(isSolid(b, 2, 1), 'the same door in an untouched parse').toBe(true)
  })

  it('opening one door does not open its twin in the same level', () => {
    const twins = parseLevel({ ...base, grid: ['#####', '#.D.#', '#...#', '#.D.#', '#####'] })
    const doors = buildDoors(twins)
    tryOpen(doors, 2, 1, new Set())
    openFully(twins, doors)

    expect(isSolid(twins, 2, 1)).toBe(false)
    expect(isSolid(twins, 2, 3), 'the other D in the same grid').toBe(true)
  })
})

describe('useTarget', () => {
  const level = parseLevel(base)

  /** Yaw that faces (dx, dz). Forward is (-sin yaw, -cos yaw). */
  const facing = (dx: number, dz: number) => Math.atan2(-dx, -dz)

  it('finds the door in the cell you are facing', () => {
    expect(useTarget(level, 1.5, 1.5, facing(1, 0))).toEqual({ x: 2, z: 1 })
  })

  it('works from every cardinal direction', () => {
    // A door with open floor on all four sides. Against a re-derivation of the
    // facing trig this passes for two of the four and fails for the pair whose
    // sign is wrong -- which is exactly how the inverted-aim bug survived.
    const cross = parseLevel({
      ...base,
      grid: ['#####', '##.##', '#.D.#', '##.##', '#####'],
      entities: [{ type: 'player', x: 2.5, z: 1.5 }],
    })
    const door = { x: 2, z: 2 }

    expect(useTarget(cross, 1.5, 2.5, facing(1, 0)), 'from the west').toEqual(door)
    expect(useTarget(cross, 3.5, 2.5, facing(-1, 0)), 'from the east').toEqual(door)
    expect(useTarget(cross, 2.5, 1.5, facing(0, 1)), 'from the north').toEqual(door)
    expect(useTarget(cross, 2.5, 3.5, facing(0, -1)), 'from the south').toEqual(door)
  })

  it('does not find a door you have your back to', () => {
    expect(useTarget(level, 1.5, 1.5, facing(-1, 0))).not.toEqual({ x: 2, z: 1 })
  })

  it('does not reach past the neighbouring cell', () => {
    const far = useTarget(level, 1.5, 1.5, facing(0, 1))
    // Straight down column 1 is open floor for two more cells, then the wall
    // at (1,4) -- which is 2.5 away and well outside the reach.
    expect(far).toBeNull()
    expect(USE_RANGE).toBeLessThan(2)
  })

  it('will not open a door through the wall in front of it', () => {
    // The DDA stops at the first solid cell, so the wall answers, not the door.
    const walled = parseLevel({ ...base, grid: ['#####', '#.#D#', '#...#', '#...#', '#####'] })
    expect(useTarget(walled, 1.5, 1.5, facing(1, 0))).toEqual({ x: 2, z: 1 })
  })

  it('sees straight through a door that is already open', () => {
    // Which is what makes using an open door a no-op rather than shutting it.
    const own = parseLevel(base)
    const doors = buildDoors(own)
    tryOpen(doors, 2, 1, new Set())
    openFully(own, doors)
    expect(useTarget(own, 1.5, 1.5, facing(1, 0))).not.toEqual({ x: 2, z: 1 })
  })
})

describe('e1m1', () => {
  it('unlocks the whole map once its doors are open', () => {
    // The claim this phase exists to make good on: 44 of 168 walkable cells
    // were unreachable in play, purely because doors never opened.
    const level = parseLevel(e1m1)
    const doors = buildDoors(level)

    const walkable = level.cells.filter((c) => c.floor ?? c.exit ?? c.door ?? c.secretWall)
    const reach = (): number => {
      const seen = new Set<number>([Math.floor(1.5) * level.width + Math.floor(1.5)])
      const queue = [...seen]
      while (queue.length > 0) {
        const index = queue.pop() as number
        const x = index % level.width
        const z = Math.floor(index / level.width)
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const ni = (z + dz) * level.width + (x + dx)
          if (seen.has(ni) || isSolid(level, x + dx, z + dz)) continue
          seen.add(ni)
          queue.push(ni)
        }
      }
      return seen.size
    }

    const shut = reach()
    expect(shut).toBeLessThan(walkable.length)

    // The red door needs its card; the flood is only claiming what a player
    // holding everything can walk to.
    for (const door of doors) tryOpen(doors, door.x, door.z, new Set(['red']))
    openFully(level, doors)

    expect(reach()).toBe(walkable.length)
    expect(walkable.length - shut, 'cells that were unreachable with doors shut').toBeGreaterThan(
      40,
    )
  })
})
