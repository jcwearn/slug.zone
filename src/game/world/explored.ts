import { hasLineOfSight } from '../engine/collision.ts'
import { cellAt, isSolid, type Level } from './level.ts'

/**
 * Which cells the player has actually seen.
 *
 * Pure -- the minimap draws this, but nothing here knows that. Fog of war is a
 * property of where the player has been and what they could see from there,
 * and keeping it out of the renderer is what makes "does walking the level
 * reveal the level" a test rather than a thing you check by playing for two
 * minutes.
 */

export interface Explored {
  width: number
  height: number
  /** One byte per cell, row-major like `Level.cells`. */
  seen: Uint8Array
  /** Where the last sweep was run from. */
  lastX: number
  lastZ: number
  /** False until the first sweep, so spawn is never skipped as "not moved". */
  primed: boolean
}

/**
 * How far the player sees, in grid units.
 *
 * Roughly the distance the lantern and the fog let you make out a wall. Much
 * further and the map fills in through doorways you only glanced past; much
 * less and you have to hug every wall to chart a room.
 */
export const REVEAL_RADIUS = 6.5

/**
 * How far the player must move before the sweep runs again.
 *
 * The sweep is ~170 line-of-sight raycasts. At a 1/60 step and a walk speed of
 * 2.6 cells per second it would otherwise run every frame to redraw the same
 * answer; this makes it about seven times a second while moving and never
 * while standing still.
 */
const RESWEEP_DISTANCE = 0.35

export function createExplored(level: Level): Explored {
  return {
    width: level.width,
    height: level.height,
    seen: new Uint8Array(level.width * level.height),
    lastX: 0,
    lastZ: 0,
    primed: false,
  }
}

export function resetExplored(explored: Explored): void {
  explored.seen.fill(0)
  explored.primed = false
}

export function isExplored(explored: Explored, x: number, z: number): boolean {
  if (x < 0 || z < 0 || x >= explored.width || z >= explored.height) return false
  return explored.seen[z * explored.width + x] === 1
}

/**
 * Chart everything visible from (x, z). Returns how many cells were new.
 *
 * Two passes, and the second one is not optional. Line of sight to a WALL's
 * centre is always blocked -- by that wall -- so a sweep that only marked what
 * it could see would chart every corridor as a floating strip of floor with no
 * edges. Walls are charted because the floor beside them is: you see a wall by
 * seeing the room it encloses.
 *
 * `void` is never charted. It is outside the map, never drawn in the world,
 * and drawing it on the map would trace the outline of rooms nobody has been
 * in yet.
 */
export function revealFrom(level: Level, explored: Explored, x: number, z: number): number {
  const moved = Math.hypot(x - explored.lastX, z - explored.lastZ)
  if (explored.primed && moved < RESWEEP_DISTANCE) return 0

  explored.primed = true
  explored.lastX = x
  explored.lastZ = z

  const cellX = Math.floor(x)
  const cellZ = Math.floor(z)
  let added = 0

  const mark = (cx: number, cz: number): void => {
    if (cx < 0 || cz < 0 || cx >= explored.width || cz >= explored.height) return
    if (cellAt(level, cx, cz)?.void) return
    const index = cz * explored.width + cx
    if (explored.seen[index] === 1) return
    explored.seen[index] = 1
    added++
  }

  // The cell underfoot, unconditionally. Standing inside a doorway as the leaf
  // comes down would otherwise leave the one cell you are certain about blank.
  mark(cellX, cellZ)

  const minX = Math.max(0, Math.floor(x - REVEAL_RADIUS))
  const maxX = Math.min(explored.width - 1, Math.ceil(x + REVEAL_RADIUS))
  const minZ = Math.max(0, Math.floor(z - REVEAL_RADIUS))
  const maxZ = Math.min(explored.height - 1, Math.ceil(z + REVEAL_RADIUS))

  const litFloor: [number, number][] = []

  for (let cz = minZ; cz <= maxZ; cz++) {
    for (let cx = minX; cx <= maxX; cx++) {
      const centreX = cx + 0.5
      const centreZ = cz + 0.5
      if (Math.hypot(centreX - x, centreZ - z) > REVEAL_RADIUS) continue
      // Solid cells are charted by the pass below, from the open ground beside
      // them -- a ray at a wall's own centre stops in that wall every time.
      if (isSolid(level, cx, cz)) continue
      if (!hasLineOfSight(level, x, z, centreX, centreZ)) continue
      mark(cx, cz)
      litFloor.push([cx, cz])
    }
  }

  // Every solid touching charted floor, corners included, so a room comes out
  // as a closed outline rather than four walls with gaps at the corners.
  for (const [cx, cz] of litFloor) {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue
        if (!isSolid(level, cx + dx, cz + dz)) continue
        mark(cx + dx, cz + dz)
      }
    }
  }

  return added
}
