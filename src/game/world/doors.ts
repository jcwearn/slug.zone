import { raycast } from '../engine/collision.ts'
import { aimDirection } from '../player/aim.ts'
import { cellAt, type Cell, type Level } from './level.ts'

/**
 * Doors and secret walls: what is shut, what is rising, and what a keycard
 * opens.
 *
 * Pure apart from two writes: a `Door`'s own phase, and `cell.open` on the
 * level. This module is the ONLY place permitted to write `cell.open` --
 * `isSolid` reads it, and everything that collides, raycasts or checks line of
 * sight goes through `isSolid`, so one write here reaches all of them.
 */

export type DoorPhase = 'closed' | 'opening' | 'open'

export interface Door {
  x: number
  z: number
  /** null for an unkeyed door. Secrets are always null. */
  key: string | null
  /** Counts toward the level's secret tally when opened. */
  secret: boolean
  /** Texture key for the leaf: 'door', or the secret's own wall texture. */
  texture: string
  phase: DoorPhase
  /** 0 shut, 1 fully risen. */
  openness: number
}

/** Seconds for a leaf to travel its full height. */
export const OPEN_TIME = 1.1

/**
 * How far a leaf must have risen before you can walk under it.
 *
 * Below 1 on purpose: waiting for the animation to finish means bouncing off a
 * door that has visibly opened, which reads as the door being broken rather
 * than as you being early. Above a half, so you are never walking through a
 * leaf that still fills most of the doorway.
 */
export const PASSABLE_AT = 0.55

/**
 * How far the use key reaches, in grid units from the player's centre.
 *
 * The player's radius is 0.28, so pressed flush against a door the centre is
 * a shade over 0.28 away; standing at the far edge of the adjacent cell it is
 * 1.0. This covers the whole neighbouring cell with slack and never reaches
 * into the one beyond it.
 */
export const USE_RANGE = 1.25

/** Doors open and stay open. See the note on `tickDoors`. */
export function buildDoors(level: Level): Door[] {
  const doors: Door[] = []
  for (const cell of level.cells) {
    if (cell.door) {
      doors.push({
        x: cell.x,
        z: cell.z,
        key: cell.door.key,
        secret: false,
        texture: 'door',
        phase: 'closed',
        openness: 0,
      })
    } else if (cell.secretWall) {
      // The secret keeps the texture of the wall it is hiding among. That is
      // the entire disguise -- a secret you can see is not one.
      doors.push({
        x: cell.x,
        z: cell.z,
        key: null,
        secret: true,
        texture: cell.secretWall,
        phase: 'closed',
        openness: 0,
      })
    }
  }
  return doors
}

export function doorAt(doors: Door[], x: number, z: number): Door | undefined {
  return doors.find((d) => d.x === x && d.z === z)
}

export type UseOutcome = 'opened' | 'locked' | 'already' | 'none'

export interface UseResult {
  outcome: UseOutcome
  door?: Door
}

/**
 * Try to open whatever is at (x, z).
 *
 * `locked` and `none` are deliberately different answers: one deserves a
 * thud and a message naming the key, the other deserves silence. A wall that
 * grunts at you every time you press the use key is worse than one that does
 * nothing.
 */
export function tryOpen(doors: Door[], x: number, z: number, keys: ReadonlySet<string>): UseResult {
  const door = doorAt(doors, x, z)
  if (!door) return { outcome: 'none' }
  if (door.phase !== 'closed') return { outcome: 'already', door }
  if (door.key !== null && !keys.has(door.key)) return { outcome: 'locked', door }

  door.phase = 'opening'
  return { outcome: 'opened', door }
}

/**
 * Advance every rising leaf and publish passability onto the level's cells.
 *
 * There is no `closing` phase. Doom's auto-closing doors need crush logic --
 * never shut on a body -- and buy nothing here: E1M1 is one connected space,
 * and a door dropping behind you only creates a way to be squashed. Adding it
 * later is one more `DoorPhase` and one more branch, and `PASSABLE_AT` stays
 * meaningful because openness is currently monotone.
 */
export function tickDoors(doors: Door[], level: Level, dt: number): void {
  for (const door of doors) {
    if (door.phase === 'opening') {
      door.openness = Math.min(1, door.openness + dt / OPEN_TIME)
      if (door.openness >= 1) door.phase = 'open'
    }
    publish(level, door)
  }
}

/** Shut everything and clear every `cell.open`, for a restart. */
export function resetDoors(doors: Door[], level: Level): void {
  for (const door of doors) {
    door.phase = 'closed'
    door.openness = 0
    publish(level, door)
  }
}

function publish(level: Level, door: Door): void {
  const cell: Cell | undefined = cellAt(level, door.x, door.z)
  if (cell) cell.open = door.openness >= PASSABLE_AT
}

/**
 * Which cell the player is using, or null.
 *
 * The existing DDA rather than a check of the four neighbours: it handles
 * diagonal approaches and corners for free, and it refuses to open a door
 * through the wall in front of it because it stops at the first solid cell.
 *
 * Pitch is deliberately ignored, exactly as `movementDelta` ignores it --
 * looking at the floor must not stop you opening a door. `aimDirection(yaw, 0)`
 * is the horizontal facing vector and is the single source of the convention;
 * re-deriving `(-sin, -cos)` here is how the two drift apart.
 *
 * An already-open door is transparent to `isSolid`, so the ray passes straight
 * through it to whatever is behind -- which is why using an open door does
 * nothing rather than shutting it.
 */
export function useTarget(
  level: Level,
  x: number,
  z: number,
  yaw: number,
): { x: number; z: number } | null {
  const dir = aimDirection(yaw, 0)
  const hit = raycast(level, x, z, dir.x, dir.z, USE_RANGE)
  if (!hit) return null
  return { x: hit.cellX, z: hit.cellZ }
}
