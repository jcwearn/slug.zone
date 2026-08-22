import type { CellSpec, EntitySpec, LevelSource } from './types.ts'

export interface Cell extends CellSpec {
  x: number
  z: number
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
      cells.push({ ...spec, x, z })
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
 * Blocks movement. Doors count as solid until opened -- door state lives with
 * the door system, not the geometry, so this is the closed-world answer.
 * Anything off-grid is solid, which is what stops a body leaving the map.
 */
export function isSolid(level: Level, x: number, z: number): boolean {
  const cell = cellAt(level, x, z)
  if (!cell) return true
  return Boolean(cell.wall ?? cell.secretWall ?? cell.door ?? cell.void)
}

/** Traversable when working out whether the level can actually be completed. */
function isWalkableForReachability(level: Level, x: number, z: number): boolean {
  const cell = cellAt(level, x, z)
  if (!cell) return false
  return Boolean(cell.floor ?? cell.exit ?? cell.door)
}

/**
 * Flood fill from the player start over floor, doors and the exit.
 *
 * This is the check that a map is actually finishable. Walling the exit off is
 * a one-character mistake in a hand-edited grid and completely invisible until
 * someone plays to the end and finds nothing there.
 */
export function reachableFromStart(level: Level): Set<number> {
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
      if (!isWalkableForReachability(level, nx, nz)) continue
      seen.add(ni)
      queue.push(ni)
    }
  }

  return seen
}

/** Cells the player can never get to. An empty result is the healthy case. */
export function unreachableWalkableCells(level: Level): Cell[] {
  const seen = reachableFromStart(level)
  return level.cells.filter(
    (c) => (c.floor ?? c.exit ?? c.door) && !seen.has(c.z * level.width + c.x),
  )
}
