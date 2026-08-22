import { moveWithCollision, PLAYER_RADIUS } from '../engine/collision.ts'
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

export function updatePlayer(player: PlayerState, level: Level, input: Input, dt: number): void {
  const look = input.consumeLook()
  player.yaw += look.yaw
  // Just shy of straight up/down: at exactly +/-PI/2 the camera basis
  // degenerates and the view rolls.
  player.pitch = clamp(player.pitch + look.pitch, -PITCH_LIMIT, PITCH_LIMIT)

  const move = moveVector((a) => input.isDown(a))
  const speed = WALK_SPEED * (input.isDown('run') ? RUN_MULTIPLIER : 1)

  const sin = Math.sin(player.yaw)
  const cos = Math.cos(player.yaw)
  // Forward is -z in three's convention with yaw about +y.
  const dx = (move.x * cos - move.z * sin) * speed * dt
  const dz = (move.x * sin + move.z * cos) * speed * dt

  const before = { x: player.x, z: player.z }
  const after = moveWithCollision(level, player.x, player.z, dx, dz, PLAYER_RADIUS)
  player.x = after.x
  player.z = after.z

  const travelled = Math.hypot(player.x - before.x, player.z - before.z)
  if (travelled > 1e-5) {
    player.bobPhase += travelled * BOB_FREQUENCY
    player.eyeOffset = Math.sin(player.bobPhase) * BOB_AMPLITUDE
  } else {
    // Settle back to level rather than freezing mid-bob.
    player.eyeOffset += (0 - player.eyeOffset) * Math.min(1, dt * 8)
  }
}
