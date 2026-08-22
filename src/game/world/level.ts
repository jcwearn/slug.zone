import type { CellSpec, EntitySpec, LevelSource } from './types.ts'

export interface Cell extends CellSpec {
  x: number
  z: number
  /**
   * Runtime state, never authored. Set by `world/doors.ts` once a door or
   * secret has risen far enough to walk through.
   *
   * It lives on the Cell and NOT on `cell.door`, which would be the obvious
   * place. `parseLevel` copies the legend spec shallowly, so every `D` cell
   * shares ONE `door` object -- the same one the level module exports, and the
   * same one every other parse of that level gets. A flag written there opens
   * every door in the level at once and leaks into the next test in the file.
   */
  open?: boolean
}

export interface Level {
  id: string
  name: string
  music: string
  cellSize: number
  wallHeight: number
  floorTex: string
  ceilingTex: string
  fog: number
  width: number
  height: number
  cells: Cell[]
  entities: EntitySpec[]
  playerStart: { x: number; z: number; angle: number }
  secretCount: number
  par: number
}

export class LevelParseError extends Error {}

/**
 * Turn a hand-edited ASCII grid into something the renderer and collision can
 * use, failing loudly on anything malformed.
 *
 * Every check here exists because the alternative is a level that loads and is
 * subtly wrong: a ragged row silently shifts every cell after it, an unknown
 * character would otherwise become a hole in the world, and a level with no
 * player start would drop you at the origin -- which is usually inside a wall.
 */
export function parseLevel(src: LevelSource): Level {
  if (src.grid.length === 0) throw new LevelParseError(`${src.id}: grid is empty`)

  const height = src.grid.length
  const width = src.grid[0].length

  const ragged = src.grid.findIndex((row) => row.length !== width)
  if (ragged !== -1) {
    throw new LevelParseError(
      `${src.id}: row ${ragged} is ${src.grid[ragged].length} wide, expected ${width}`,
    )
  }

  const cells: Cell[] = []
  let secretCount = 0

  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      const ch = src.grid[z][x]
      const spec = src.legend[ch]
      if (!spec) {
        throw new LevelParseError(
          `${src.id}: unknown legend character ${JSON.stringify(ch)} at ${x},${z}`,
        )
      }
      if (spec.secretWall) secretCount++
      // `door` is copied rather than shared. A shallow spread would hand every
      // door cell in the level the same object, so anything that ever writes
      // to one writes to all of them -- and to the legend the level module
      // exports, which outlives the parse.
      cells.push({ ...spec, door: spec.door ? { ...spec.door } : undefined, x, z })
    }
  }

  const start = src.entities.find((e) => e.type === 'player')
  if (!start) throw new LevelParseError(`${src.id}: no player entity in the level`)

  const outside = src.entities.filter((e) => e.x < 0 || e.z < 0 || e.x >= width || e.z >= height)
  if (outside.length > 0) {
    throw new LevelParseError(
      `${src.id}: ${outside.length} entit${outside.length === 1 ? 'y is' : 'ies are'} ` +
        `outside the ${width}x${height} grid: ` +
        outside.map((e) => `${e.type}@${e.x},${e.z}`).join(', '),
    )
  }

  const level: Level = {
    id: src.id,
    name: src.name,
    music: src.music,
    cellSize: src.cellSize,
    wallHeight: src.wallHeight,
    floorTex: src.floorTex,
    ceilingTex: src.ceilingTex,
    fog: src.fog,
    width,
    height,
    cells,
    entities: src.entities.filter((e) => e.type !== 'player'),
    playerStart: { x: start.x, z: start.z, angle: start.angle ?? 0 },
    secretCount,
    par: src.par,
  }

  if (isSolid(level, Math.floor(start.x), Math.floor(start.z))) {
    throw new LevelParseError(
      `${src.id}: player starts inside a solid cell at ${start.x},${start.z}`,
    )
  }

  return level
}

export function cellAt(level: Level, x: number, z: number): Cell | undefined {
  if (x < 0 || z < 0 || x >= level.width || z >= level.height) return undefined
  return level.cells[z * level.width + x]
}

/**
 * Blocks movement. Anything off-grid is solid, which is what stops a body
 * leaving the map.
 *
 * Doors and secret walls are solid until `world/doors.ts` marks the cell open.
 * Putting the runtime flag here rather than threading a door-state object
 * through every collision call is deliberate: `moveWithCollision`, the DDA
 * raycast, line of sight, the enemy mover and the glob step all already funnel
 * through this one function, so they get door state for free and cannot
 * disagree about it. Ten extra signatures could each be passed the wrong
 * thing; there is nothing here to pass wrongly.
 */
export function isSolid(level: Level, x: number, z: number): boolean {
  const cell = cellAt(level, x, z)
  if (!cell) return true
  if (cell.open) return false
  return Boolean(cell.wall ?? cell.secretWall ?? cell.door ?? cell.void)
}

/**
 * Traversable when working out whether the level can actually be completed.
 *
 * A door is passable only if the player could be holding its key by the time
 * they arrive. `secretWall` is deliberately never passable: a secret must not
 * be load-bearing, because a level that only completes by finding one is a
 * level most players cannot complete at all.
 */
function isWalkableForReachability(
  level: Level,
  x: number,
  z: number,
  keys: ReadonlySet<string>,
): boolean {
  const cell = cellAt(level, x, z)
  if (!cell) return false
  if (cell.floor ?? cell.exit) return true
  if (cell.door) return cell.door.key === null || keys.has(cell.door.key)
  return false
}

function flood(level: Level, keys: ReadonlySet<string>): Set<number> {
  const seen = new Set<number>()
  const start = Math.floor(level.playerStart.z) * level.width + Math.floor(level.playerStart.x)
  const queue = [start]
  seen.add(start)

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
      const nx = x + dx
      const nz = z + dz
      const ni = nz * level.width + nx
      if (seen.has(ni)) continue
      if (!isWalkableForReachability(level, nx, nz, keys)) continue
      seen.add(ni)
      queue.push(ni)
    }
  }

  return seen
}

/**
 * Flood fill from the player start, over floor, the exit, and every door whose
 * key the player could actually have got hold of by the time they reach it.
 *
 * This is the check that a map is finishable. Walling the exit off is a
 * one-character mistake in a hand-edited grid and completely invisible until
 * someone plays to the end and finds nothing there.
 *
 * A fixed point rather than a single pass, because collecting one key opens
 * doors that expose the next. Without the loop, "reachable" quietly assumes
 * the player already holds every card in the game -- so a red key sealed
 * inside the red vault it opens passes every check here and ships as a level
 * that cannot be finished.
 *
 * It terminates because `keys` only ever grows and there are three of them.
 */
export function reachableFromStart(level: Level): Set<number> {
  const keys = new Set<string>()

  for (;;) {
    const seen = flood(level, keys)
    let grew = false

    for (const entity of level.entities) {
      if (entity.type !== 'pickup') continue
      const colour = keyColourOf(entity.item)
      if (!colour || keys.has(colour)) continue
      if (!seen.has(Math.floor(entity.z) * level.width + Math.floor(entity.x))) continue
      keys.add(colour)
      grew = true
    }

    if (!grew) return seen
  }
}

/**
 * Which keycard an item is, if it is one.
 *
 * Kept here, on the item id, rather than reaching for the pickup catalogue:
 * reachability is a property of the level file and should not need the
 * gameplay registry to answer a question about the grid. The naming convention
 * is the contract, and `level.test.ts` holds every shipped item to it.
 */
function keyColourOf(item: string | undefined): string | null {
  if (!item) return null
  for (const colour of ['red', 'blue', 'yellow']) {
    if (item === `${colour}key`) return colour
  }
  return null
}

/** Cells the player can never get to. An empty result is the healthy case. */
export function unreachableWalkableCells(level: Level): Cell[] {
  const seen = reachableFromStart(level)
  return level.cells.filter(
    (c) => (c.floor ?? c.exit ?? c.door) && !seen.has(c.z * level.width + c.x),
  )
}
