import { describe, expect, it } from 'vitest'
import {
  cellAt,
  isSolid,
  LevelParseError,
  parseLevel,
  reachableFromStart,
  unreachableWalkableCells,
} from './level.ts'
import type { LevelSource } from './types.ts'
import e1m1 from './levels/e1m1.ts'

const base: LevelSource = {
  id: 'test',
  name: 'Test',
  music: 'none',
  cellSize: 4,
  wallHeight: 4,
  floorTex: 'damp',
  ceilingTex: 'concrete',
  fog: 0.05,
  legend: {
    '#': { wall: 'brick' },
    '.': { floor: true },
    S: { secretWall: 'brick' },
    X: { exit: true },
    D: { door: { key: null } },
  },
  grid: ['#####', '#...#', '#.S.#', '#..X#', '#####'],
  entities: [{ type: 'player', x: 1.5, z: 1.5, angle: 0 }],
  par: 1000,
}

const withGrid = (grid: string[], extra: Partial<LevelSource> = {}) =>
  ({ ...base, grid, ...extra }) as LevelSource

describe('parseLevel', () => {
  it('reads dimensions from the grid', () => {
    const level = parseLevel(base)
    expect(level.width).toBe(5)
    expect(level.height).toBe(5)
    expect(level.cells).toHaveLength(25)
  })

  it('counts secret walls', () => {
    expect(parseLevel(base).secretCount).toBe(1)
  })

  it('extracts the player start and removes it from entities', () => {
    const level = parseLevel({
      ...base,
      entities: [
        { type: 'player', x: 1.5, z: 1.5, angle: 1.2 },
        { type: 'grub', x: 3.5, z: 3.5 },
      ],
    })
    expect(level.playerStart).toEqual({ x: 1.5, z: 1.5, angle: 1.2 })
    expect(level.entities).toHaveLength(1)
    expect(level.entities[0].type).toBe('grub')
  })

  it('defaults a missing start angle to 0', () => {
    const level = parseLevel({ ...base, entities: [{ type: 'player', x: 1.5, z: 1.5 }] })
    expect(level.playerStart.angle).toBe(0)
  })

  it('rejects a ragged grid, naming the row', () => {
    // A short row silently shifts every cell after it if this is not caught.
    expect(() => parseLevel(withGrid(['#####', '#..#', '#####']))).toThrow(/row 1 is 4 wide/)
  })

  it('rejects an unknown legend character', () => {
    expect(() => parseLevel(withGrid(['#####', '#.?.#', '#####']))).toThrow(LevelParseError)
    expect(() => parseLevel(withGrid(['#####', '#.?.#', '#####']))).toThrow(/"\?"/)
  })

  it('rejects a level with no player', () => {
    expect(() => parseLevel({ ...base, entities: [] })).toThrow(/no player entity/)
  })

  it('rejects a player start inside a wall', () => {
    expect(() => parseLevel({ ...base, entities: [{ type: 'player', x: 0.5, z: 0.5 }] })).toThrow(
      /inside a solid cell/,
    )
  })

  it('rejects entities placed outside the grid', () => {
    expect(() =>
      parseLevel({
        ...base,
        entities: [
          { type: 'player', x: 1.5, z: 1.5 },
          { type: 'grub', x: 99, z: 1.5 },
        ],
      }),
    ).toThrow(/outside the 5x5 grid/)
  })

  it('rejects an empty grid', () => {
    expect(() => parseLevel(withGrid([]))).toThrow(/grid is empty/)
  })
})

describe('isSolid', () => {
  const level = parseLevel(base)

  it('treats walls, secret walls and doors as solid', () => {
    expect(isSolid(level, 0, 0)).toBe(true)
    expect(isSolid(level, 2, 2)).toBe(true) // secret wall
  })

  it('treats floor and exit as open', () => {
    expect(isSolid(level, 1, 1)).toBe(false)
    expect(isSolid(level, 3, 3)).toBe(false) // exit
  })

  it('treats everything off-grid as solid, so nothing can leave the map', () => {
    expect(isSolid(level, -1, 1)).toBe(true)
    expect(isSolid(level, 1, -1)).toBe(true)
    expect(isSolid(level, 5, 1)).toBe(true)
    expect(isSolid(level, 1, 5)).toBe(true)
  })
})

describe('cellAt', () => {
  const level = parseLevel(base)

  it('indexes row-major with z as the row', () => {
    expect(cellAt(level, 3, 3)?.exit).toBe(true)
    expect(cellAt(level, 2, 2)?.secretWall).toBe('brick')
  })

  it('returns undefined off-grid rather than wrapping', () => {
    expect(cellAt(level, -1, 0)).toBeUndefined()
    expect(cellAt(level, 0, -1)).toBeUndefined()
    expect(cellAt(level, 5, 0)).toBeUndefined()
  })
})

describe('reachability', () => {
  it('finds the exit in a connected map', () => {
    const level = parseLevel(base)
    expect(unreachableWalkableCells(level)).toHaveLength(0)
  })

  it('reports cells sealed off from the start', () => {
    // Two rooms with no connection. This is the one-character mistake that a
    // hand-edited grid makes constantly and that is invisible until someone
    // plays to the end and finds nothing there.
    const level = parseLevel(
      withGrid(['#######', '#..#..#', '#..#..X', '#######'], {
        entities: [{ type: 'player', x: 1.5, z: 1.5 }],
      }),
    )
    const stranded = unreachableWalkableCells(level)
    expect(stranded.length).toBeGreaterThan(0)
    expect(stranded.some((c) => c.exit)).toBe(true)
  })

  it('treats a closed door as passable, since it can be opened', () => {
    const level = parseLevel(
      withGrid(['#####', '#.D.#', '#####'], {
        entities: [{ type: 'player', x: 1.5, z: 1.5 }],
      }),
    )
    const seen = reachableFromStart(level)
    expect(seen.has(1 * 5 + 3)).toBe(true)
  })
})

describe('shipped levels', () => {
  // Every level file must parse. Cheap, and it catches typos in a hand-edited
  // ASCII grid the moment they are introduced rather than at play time.
  const levels = [e1m1]

  it.each(levels.map((l) => [l.id, l] as const))('%s parses', (_id, src) => {
    expect(() => parseLevel(src)).not.toThrow()
  })

  it.each(levels.map((l) => [l.id, l] as const))('%s is completable', (_id, src) => {
    const level = parseLevel(src)
    const exits = level.cells.filter((c) => c.exit)
    expect(exits.length).toBeGreaterThan(0)

    const seen = reachableFromStart(level)
    for (const exit of exits) {
      expect(seen.has(exit.z * level.width + exit.x)).toBe(true)
    }
  })

  it.each(levels.map((l) => [l.id, l] as const))('%s strands no walkable cells', (_id, src) => {
    const stranded = unreachableWalkableCells(parseLevel(src))
    expect(
      stranded.map((c) => `${c.x},${c.z}`),
      'cells the player can never reach',
    ).toEqual([])
  })

  it.each(levels.map((l) => [l.id, l] as const))(
    '%s places every entity on open ground',
    (_id, src) => {
      const level = parseLevel(src)
      const embedded = [level.playerStart, ...level.entities].filter((e) =>
        isSolid(level, Math.floor(e.x), Math.floor(e.z)),
      )
      expect(embedded, 'entities stuck inside walls').toEqual([])
    },
  )
})
