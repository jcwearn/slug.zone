import { describe, expect, it } from 'vitest'
import {
  cellAt,
  isSolid,
  LevelParseError,
  parseLevel,
  reachableFromStart,
  unmarkableExits,
  unreachableWalkableCells,
} from './level.ts'
import type { LevelSource } from './types.ts'
import { ITEMS } from '../pickups/definitions.ts'
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

  it('strands a vault whose key is locked inside it', () => {
    // The mistake this exists for: a red key sealed behind the red door it
    // opens. Every other check here passes, and the level ships unfinishable.
    const level = parseLevel(
      withGrid(['#######', '#..R..#', '#######'], {
        legend: { ...base.legend, R: { door: { key: 'red' } } },
        entities: [
          { type: 'player', x: 1.5, z: 1.5 },
          { type: 'pickup', item: 'redkey', x: 4.5, z: 1.5 },
        ],
      }),
    )
    const stranded = unreachableWalkableCells(level)
    expect(stranded.length).toBeGreaterThan(0)
    // The unopenable door reports itself, which is the clearest message there
    // is about which door is the problem.
    expect(stranded.some((c) => c.door)).toBe(true)
  })

  it('opens the same vault when the key is on the near side', () => {
    // The other half. Without this the test above passes for a version that
    // simply refuses every keyed door and never collects anything.
    const level = parseLevel(
      withGrid(['#######', '#..R..#', '#######'], {
        legend: { ...base.legend, R: { door: { key: 'red' } } },
        entities: [
          { type: 'player', x: 1.5, z: 1.5 },
          { type: 'pickup', item: 'redkey', x: 2.5, z: 1.5 },
        ],
      }),
    )
    expect(unreachableWalkableCells(level)).toEqual([])
  })

  it('resolves a chain of keys, each behind the last', () => {
    // A single pass collects red and stops, leaving everything past the blue
    // door stranded. Only a fixed point gets to the end.
    const level = parseLevel(
      withGrid(['#########', '#..R..B.#', '#########'], {
        legend: {
          ...base.legend,
          R: { door: { key: 'red' } },
          B: { door: { key: 'blue' } },
        },
        entities: [
          { type: 'player', x: 1.5, z: 1.5 },
          { type: 'pickup', item: 'redkey', x: 2.5, z: 1.5 },
          { type: 'pickup', item: 'bluekey', x: 5.5, z: 1.5 },
        ],
      }),
    )
    expect(unreachableWalkableCells(level)).toEqual([])
  })

  it('never lets a secret be the only way through', () => {
    // A level that can only be completed by finding a secret is a level most
    // players cannot complete at all.
    const level = parseLevel(
      withGrid(['#####', '#.S.#', '#####'], {
        entities: [{ type: 'player', x: 1.5, z: 1.5 }],
      }),
    )
    expect(reachableFromStart(level).has(1 * 5 + 3)).toBe(false)
  })
})

describe('unmarkableExits', () => {
  it('reports an exit standing in open floor', () => {
    // Nothing to mount a sign on, so the way out is invisible and the level
    // ends when somebody happens to walk over the right square.
    const level = parseLevel(
      withGrid(['#####', '#...#', '#.X.#', '#...#', '#####'], {
        entities: [{ type: 'player', x: 1.5, z: 1.5 }],
      }),
    )
    expect(unmarkableExits(level).map((c) => `${c.x},${c.z}`)).toEqual(['2,2'])
  })

  it('is happy with an exit in an alcove', () => {
    const level = parseLevel(
      withGrid(['#####', '#...#', '#.#.#', '#.X.#', '#####'], {
        entities: [{ type: 'player', x: 1.5, z: 1.5 }],
      }),
    )
    expect(unmarkableExits(level)).toEqual([])
  })

  it('needs only one wall, not four', () => {
    const level = parseLevel(
      withGrid(['#####', '#.#.#', '#.X.#', '#...#', '#####'], {
        entities: [{ type: 'player', x: 1.5, z: 1.5 }],
      }),
    )
    expect(unmarkableExits(level)).toEqual([])
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

  it.each(levels.map((l) => [l.id, l] as const))(
    '%s names a real item on every pickup',
    (_id, src) => {
      // The parser passes entities through unvalidated -- it knows nothing about
      // the item catalogue and should not. So a typo'd `item: 'helth'` parses
      // fine and only fails at spawn, which on a level nobody has replayed since
      // means it fails in front of a player. Catching it here is what makes the
      // authoring safe.
      const level = parseLevel(src)
      const unknown = level.entities
        .filter((e) => e.type === 'pickup')
        .filter((e) => !(e.item !== undefined && e.item in ITEMS))
        .map((e) => String(e.item))
      expect(unknown, 'pickup items with no definition').toEqual([])
    },
  )

  it.each(levels.map((l) => [l.id, l] as const))(
    '%s authors no door two cells wide',
    (_id, src) => {
      // Each door cell is its own leaf with its own state, so a two-wide
      // doorway opens one half and leaves the other standing. Nothing stops a
      // level being written that way except this.
      const level = parseLevel(src)
      const leaves = level.cells.filter((c) => c.door ?? c.secretWall)
      const touching = leaves.filter((a) =>
        leaves.some((b) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z) === 1),
      )
      expect(
        touching.map((c) => `${c.x},${c.z}`),
        'door or secret cells sharing an edge',
      ).toEqual([])
    },
  )

  it.each(levels.map((l) => [l.id, l] as const))(
    '%s gives every exit a wall to sign',
    (_id, src) => {
      const unmarked = unmarkableExits(parseLevel(src))
      expect(
        unmarked.map((c) => `${c.x},${c.z}`),
        'exits with no wall to sign',
      ).toEqual([])
    },
  )

  it.each(levels.map((l) => [l.id, l] as const))('%s reaches every secret', (_id, src) => {
    // A secret walled in on all four sides can never be found, so 100% is
    // unattainable and the tally is a lie the player cannot disprove.
    const level = parseLevel(src)
    const seen = reachableFromStart(level)
    const buried = level.cells
      .filter((c) => c.secretWall)
      .filter((c) =>
        [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].every(([dx, dz]) => !seen.has((c.z + dz) * level.width + (c.x + dx))),
      )
    expect(
      buried.map((c) => `${c.x},${c.z}`),
      'secrets with no reachable cell beside them',
    ).toEqual([])
  })

  it.each(levels.map((l) => [l.id, l] as const))(
    '%s puts every entity within reach',
    (_id, src) => {
      // On open ground is not the same as reachable. An item walled into a
      // sealed pocket passes every other check here and is simply never found.
      const level = parseLevel(src)
      const seen = reachableFromStart(level)
      const marooned = level.entities
        .filter((e) => !seen.has(Math.floor(e.z) * level.width + Math.floor(e.x)))
        .map((e) => `${e.type}${e.item ? `:${e.item}` : ''}@${e.x},${e.z}`)
      expect(marooned, 'entities the player can never get to').toEqual([])
    },
  )
})
