import * as THREE from 'three'
import { spawnEnemy, type Enemy } from '../enemies/enemy.ts'
import { buildEnemyView, type EnemyView } from '../enemies/render.ts'
import { createPickups, type Pickup } from '../pickups/pickups.ts'
import { buildPickupView, type PickupView } from '../pickups/render.ts'
import { createExplored, type Explored } from './explored.ts'
import { buildLevelMeshes, type LevelMeshes } from './geometry.ts'
import { buildDoors, type Door } from './doors.ts'
import { DoorViews } from './doorview.ts'
import { ExitViews } from './exitview.ts'
import type { Level } from './level.ts'
import { worldSpace, type WorldSpace } from './space.ts'

/**
 * Everything whose lifetime is exactly one level.
 *
 * The player, their health, their arsenal and their keys are deliberately NOT
 * here: those outlive a level, and which of them survive a transition is
 * `campaign.ts`. What is here is what has to be thrown away and rebuilt.
 *
 * The interface IS the checklist. A field added to it will not compile until
 * `loadWorld` returns it, and `unloadWorld` is a line per field mirroring it --
 * which turns "did you remember to rebuild the fourteenth thing" from a
 * code-review question into a type error.
 */

export interface Live {
  enemy: Enemy
  view: EnemyView
  /** Whether it had noticed the player last tick, for the alert sound. */
  wasIdle: boolean
  /** Where it started, so a restart can put it back. */
  spawnX: number
  spawnZ: number
}

export interface World {
  level: Level
  space: WorldSpace
  /**
   * `level.cellSize`. Half the game multiplies by it, and it must not be a
   * second copy that can go stale -- a level with a different cell size and a
   * stale scale renders a perfectly plausible, entirely wrong world.
   */
  s: number
  meshes: LevelMeshes
  doors: Door[]
  doorViews: DoorViews
  exitViews: ExitViews
  pickups: Pickup[]
  /** Parallel to `pickups` by index, built here so the two cannot drift. */
  pickupViews: PickupView[]
  live: Live[]
  explored: Explored
  /** Cells charted so far, so the minimap knows when to repaint. */
  charted: number
}

export function loadWorld(level: Level, scene: THREE.Scene): World {
  const meshes = buildLevelMeshes(level)
  scene.add(meshes.group)

  // The leaves are separate meshes because a face merged into the level's
  // static batches cannot move. geometry.ts emits the floor and ceiling they
  // uncover. Built together with the doors they pose, because `DoorViews`
  // indexes its meshes against the door list positionally.
  const doors = buildDoors(level)
  const doorViews = new DoorViews(doors, level)
  scene.add(doorViews.group)

  const exitViews = new ExitViews(level)
  scene.add(exitViews.group)

  const pickups = createPickups(level)
  const pickupViews = pickups.map((pickup) => {
    const view = buildPickupView(pickup.def)
    scene.add(view.group)
    return view
  })

  const live: Live[] = []
  for (const entity of level.entities) {
    if (entity.type === 'pickup') continue
    const enemy = spawnEnemy(entity.type, entity.x, entity.z)
    const view = buildEnemyView(enemy.def)
    scene.add(view.group)
    live.push({ enemy, view, wasIdle: true, spawnX: entity.x, spawnZ: entity.z })
  }

  return {
    level,
    space: worldSpace(level),
    s: level.cellSize,
    meshes,
    doors,
    doorViews,
    exitViews,
    pickups,
    pickupViews,
    live,
    explored: createExplored(level),
    charted: 0,
  }
}

/**
 * Take a level back out of the scene.
 *
 * Note what is NOT called here: `disposeEnemyMeshes`, `disposePickupMeshes` and
 * `disposeTextures`. Those empty module-level caches SHARED with whatever loads
 * next. They each clear their map as well as disposing, so adding one here
 * would not hand the next level dead geometry -- it would just throw away every
 * body, item and wall texture in the game so they can be rebuilt from scratch,
 * during a transition, for nothing. The per-level Groups come out of the scene;
 * the caches they were cut from stay.
 *
 * `exitViews` is the sneaky one: its group carries a PointLight, so forgetting
 * to remove it leaves a green glow hanging at the previous level's exit.
 */
export function unloadWorld(world: World, scene: THREE.Scene): void {
  scene.remove(world.meshes.group)
  world.meshes.dispose()

  scene.remove(world.doorViews.group)
  world.doorViews.dispose()

  scene.remove(world.exitViews.group)
  world.exitViews.dispose()

  for (const view of world.pickupViews) scene.remove(view.group)
  for (const entry of world.live) scene.remove(entry.view.group)
}

/** Put every creature back where it started. For a restart, which reuses the World. */
export function respawnEnemies(world: World): void {
  for (const entry of world.live) {
    entry.enemy = spawnEnemy(entry.enemy.def.id, entry.spawnX, entry.spawnZ)
    entry.wasIdle = true
  }
}
