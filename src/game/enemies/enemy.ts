import { hasLineOfSight, moveWithCollision } from '../engine/collision.ts'
import { angleDelta } from '../engine/math.ts'
import type { Level } from '../world/level.ts'
import { ENEMIES } from './definitions.ts'
import { createMind, isAlive, step, type EnemyMind, type Perception } from './fsm.ts'
import type { Cylinder } from './hitscan.ts'
import type { EnemyDef } from './types.ts'

/**
 * A live enemy: the pure state machine plus a position in the level.
 *
 * Movement goes through the same swept collision the player uses, so enemies
 * cannot walk through walls and cannot end up inside them. Giving them their
 * own simpler mover is the usual way that happens.
 */

export interface Enemy {
  def: EnemyDef
  mind: EnemyMind
  x: number
  z: number
  /** Facing, radians, same convention as the player's yaw. */
  facing: number
  /** Seconds since spawn, for animation phase offsets. */
  age: number
}

export function spawnEnemy(type: string, x: number, z: number): Enemy {
  const def = ENEMIES[type]
  if (!def) throw new Error(`unknown enemy type: ${type}`)
  return { def, mind: createMind(def), x, z, facing: 0, age: 0 }
}

/** Turn rate in radians per second. Slower than the player, deliberately. */
const TURN_SPEED = 4.5

export function updateEnemy(
  enemy: Enemy,
  level: Level,
  playerX: number,
  playerZ: number,
  dt: number,
): void {
  enemy.age += dt

  const dx = playerX - enemy.x
  const dz = playerZ - enemy.z
  const distance = Math.hypot(dx, dz)

  // The enemy's facing uses the same convention as the player's yaw, where
  // forward is (-sin, -cos). Deriving the bearing any other way puts the sight
  // cone somewhere other than where the creature is looking.
  const bearing = Math.atan2(-dx, -dz)

  const perception: Perception = {
    distance,
    hasLineOfSight: hasLineOfSight(level, enemy.x, enemy.z, playerX, playerZ),
    angleToPlayer: Math.abs(angleDelta(enemy.facing, bearing)),
  }

  const intent = step(enemy.mind, enemy.def, perception, dt)

  if (intent.turn) {
    const delta = angleDelta(enemy.facing, bearing)
    const maxTurn = TURN_SPEED * dt
    enemy.facing += Math.abs(delta) <= maxTurn ? delta : Math.sign(delta) * maxTurn
  }

  if (intent.move && distance > 1e-4) {
    const speed = enemy.def.speed * dt
    const moved = moveWithCollision(
      level,
      enemy.x,
      enemy.z,
      (dx / distance) * speed,
      (dz / distance) * speed,
      enemy.def.radius,
    )
    enemy.x = moved.x
    enemy.z = moved.z
  }
}

/** Hit volume in WORLD units. */
export function enemyCylinder(enemy: Enemy, cellSize: number, roomHeight: number): Cylinder {
  return {
    x: enemy.x * cellSize,
    z: enemy.z * cellSize,
    radius: enemy.def.radius * cellSize,
    yMin: 0,
    yMax: enemy.def.height * roomHeight,
  }
}

/** Live enemies only. A corpse must not soak up shots meant for its friends. */
export function targetable(enemies: Enemy[]): Enemy[] {
  return enemies.filter((e) => isAlive(e.mind))
}
