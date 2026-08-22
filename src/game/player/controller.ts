import {
  moveWithCollision,
  PLAYER_RADIUS,
  slideAlongDiscs,
  type Disc,
} from '../engine/collision.ts'
import { moveVector, type Input } from '../engine/input.ts'
import { clamp } from '../engine/math.ts'
import type { Level } from '../world/level.ts'

/**
 * Player state and movement, in GRID units. The renderer scales by cellSize.
 *
 * Head bob is driven by distance travelled rather than elapsed time, so it
 * stops when you stop and does not keep swaying while you stand still reading
 * the map.
 */

export const EYE_HEIGHT = 0.55
const WALK_SPEED = 2.6
const RUN_MULTIPLIER = 1.75
const BOB_AMPLITUDE = 0.035
const BOB_FREQUENCY = 9
const PITCH_LIMIT = 1.45

export interface PlayerState {
  x: number
  z: number
  yaw: number
  pitch: number
  bobPhase: number
  eyeOffset: number
}

export function createPlayer(level: Level): PlayerState {
  return {
    x: level.playerStart.x,
    z: level.playerStart.z,
    yaw: level.playerStart.angle,
    pitch: 0,
    bobPhase: 0,
    eyeOffset: 0,
  }
}

export function updatePlayer(
  player: PlayerState,
  level: Level,
  input: Input,
  dt: number,
  /** Creatures the player cannot walk through. */
  blockers: Disc[] = [],
): void {
  const look = input.consumeLook()
  player.yaw += look.yaw
  // Just shy of straight up/down: at exactly +/-PI/2 the camera basis
  // degenerates and the view rolls.
  player.pitch = clamp(player.pitch + look.pitch, -PITCH_LIMIT, PITCH_LIMIT)

  const move = moveVector((a) => input.isDown(a))
  const speed = WALK_SPEED * (input.isDown('run') ? RUN_MULTIPLIER : 1)

  const delta = movementDelta(player.yaw, move.x, move.z)
  const dx = delta.x * speed * dt
  const dz = delta.z * speed * dt

  const before = { x: player.x, z: player.z }
  const after = moveWithCollision(level, player.x, player.z, dx, dz, PLAYER_RADIUS)
  // Walls first, then creatures. Doing it the other way lets a slug press you
  // into a wall and then the wall pass resolves you back out through the slug.
  const clear = slideAlongDiscs(before.x, before.z, after.x, after.z, PLAYER_RADIUS, blockers)
  player.x = clear.x
  player.z = clear.z

  const travelled = Math.hypot(player.x - before.x, player.z - before.z)
  if (travelled > 1e-5) {
    player.bobPhase += travelled * BOB_FREQUENCY
    player.eyeOffset = Math.sin(player.bobPhase) * BOB_AMPLITUDE
  } else {
    // Settle back to level rather than freezing mid-bob.
    player.eyeOffset += (0 - player.eyeOffset) * Math.min(1, dt * 8)
  }
}

/**
 * Turn local movement intent into a world-space delta on the ground plane.
 *
 * The camera is `rotation.set(pitch, yaw, 0, 'YXZ')`, and a three.js camera
 * looks down its own -Z. So for a given yaw the basis is:
 *
 *   forward = (-sin(yaw), 0, -cos(yaw))
 *   right   = ( cos(yaw), 0, -sin(yaw))
 *
 * Both z terms are negative, and that is the whole subtlety. This originally
 * negated neither, which mirrors the movement about the x axis rather than
 * simply reversing it -- so W was not merely backwards, it was a different
 * wrong direction at every yaw, and the controls felt like they rotated
 * independently of the camera.
 *
 * Pitch is deliberately ignored: looking at the floor should not slow you
 * down or push you into it.
 *
 * movementDelta.test.ts checks this against three.js's own camera basis rather
 * than against a re-derivation of it, so the two cannot drift apart.
 */
export function movementDelta(yaw: number, moveX: number, moveZ: number): { x: number; z: number } {
  const sin = Math.sin(yaw)
  const cos = Math.cos(yaw)
  return {
    x: moveX * cos - moveZ * sin,
    z: -moveX * sin - moveZ * cos,
  }
}
