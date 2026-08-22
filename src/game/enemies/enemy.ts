import {
  hasLineOfSight,
  moveWithCollision,
  pushOutOfDiscs,
  type Disc,
} from '../engine/collision.ts'
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
  /** The player's own footprint, so slugs stop short instead of standing in it. */
  playerRadius = 0,
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

  // Push out of the player rather than merely stopping short of them: a slug
  // can end up inside the player by the player backing into it, and something
  // has to resolve that. The player side only blocks, so this is the only
  // thing that does.
  //
  // The living only. The player already treats corpses as walk-through, but
  // this ran for every enemy, so walking into a dead slug shoved it along the
  // floor -- the body slid ahead of you like a rug. A corpse is scenery.
  if (playerRadius > 0 && isAlive(enemy.mind)) {
    const clear = pushOutOfDiscs(level, enemy.x, enemy.z, enemy.def.radius, [
      { x: playerX, z: playerZ, radius: playerRadius } satisfies Disc,
    ])
    enemy.x = clear.x
    enemy.z = clear.z
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

/**
 * Push overlapping enemies apart.
 *
 * They collide with walls but not with each other, so several chasing the same
 * player converge on the same point and stack into one composite slug. This is
 * the cheap fix -- resolve overlaps after everyone has moved -- rather than
 * steering, which is what a flocking model would do and is far more machinery
 * than a corridor shooter needs.
 *
 * Two passes. One leaves a chain of three or more still overlapping, because
 * pushing A off B can shove it into C; a second pass settles almost all of it,
 * and anything left resolves on the next tick anyway.
 */
const SEPARATION_PASSES = 2

export function separateEnemies(enemies: Enemy[], level: Level): void {
  // Corpses do not shove. Walking over a dead slug is fine and Doom-like;
  // being blocked by one is not.
  const crowd = enemies.filter((e) => isAlive(e.mind))

  for (let pass = 0; pass < SEPARATION_PASSES; pass++) {
    for (let i = 0; i < crowd.length; i++) {
      for (let j = i + 1; j < crowd.length; j++) {
        const a = crowd[i]
        const b = crowd[j]

        const dx = b.x - a.x
        const dz = b.z - a.z
        const distance = Math.hypot(dx, dz)
        const minimum = a.def.radius + b.def.radius
        if (distance >= minimum) continue

        // Direction and magnitude separately. Substituting a distance of 1 for
        // the coincident case and then deriving the push from it gives a
        // NEGATIVE push, so two slugs standing in exactly the same spot pulled
        // together rather than apart -- and still ended up a nonzero distance
        // from each other, which is why the first version of this test passed.
        let nx: number
        let nz: number
        if (distance < 1e-6) {
          // Derived from the pair's indices rather than randomly, so the result
          // is reproducible. The golden angle just stops successive pairs all
          // choosing the same axis.
          const angle = (i * crowd.length + j) * 2.399963229728653
          nx = Math.cos(angle)
          nz = Math.sin(angle)
        } else {
          nx = dx / distance
          nz = dz / distance
        }

        // Half the overlap each, plus a hair so they end up clear rather than
        // exactly touching -- on the boundary the overlap test still fires and
        // the pair gets pushed again every frame.
        const push = (minimum - distance) / 2 + 1e-3

        // Through moveWithCollision, so separating never pushes anyone into a
        // wall -- which would undo the whole reason enemies have collision.
        const movedA = moveWithCollision(level, a.x, a.z, -nx * push, -nz * push, a.def.radius)
        a.x = movedA.x
        a.z = movedA.z

        const movedB = moveWithCollision(level, b.x, b.z, nx * push, nz * push, b.def.radius)
        b.x = movedB.x
        b.z = movedB.z
      }
    }
  }
}
