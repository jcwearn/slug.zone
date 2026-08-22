import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { buildEnemyView, poseEnemy } from './render.ts'
import { spawnEnemy } from './enemy.ts'
import { damage, step } from './fsm.ts'
import { ENEMIES } from './definitions.ts'

/**
 * Enemy meshes are built from primitives with plain colour materials -- no
 * canvas textures -- so the posing can be checked in a plain node test.
 *
 * What matters here is a geometric fact rather than an aesthetic one: no part
 * of a body may go below y=0, because the floor is a plane at exactly 0 and
 * anything below it visibly slices through the ground.
 */

const STEP = 1 / 60
const CELL = 4
const ROOM = 4

/** Lowest world-space Y of any vertex in the posed body. */
function lowestPoint(group: THREE.Object3D): number {
  group.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(group)
  return box.min.y
}

describe.each(Object.values(ENEMIES).map((d) => [d.id, d] as const))('%s posing', (id, def) => {
  it('never dips below the floor at any point in the death animation', () => {
    // The bug: the death pose rolled the flattened body about its own base, so
    // one end tipped under y=0 and the corpse sliced diagonally into the floor.
    const enemy = spawnEnemy(id, 3.5, 3.5)
    const view = buildEnemyView(def)
    damage(enemy.mind, def, 9999, () => 1)

    for (let t = 0; t < def.dyingTime + 1; t += STEP) {
      poseEnemy(view, enemy, CELL, ROOM, STEP)
      expect(
        lowestPoint(view.group),
        `${id} at ${t.toFixed(2)}s into dying (state ${enemy.mind.state})`,
      ).toBeGreaterThanOrEqual(-1e-6)
      step(enemy.mind, def, { distance: 9, hasLineOfSight: false, angleToPlayer: 0 }, STEP)
    }
  })

  it('never dips below the floor in any living state', () => {
    const enemy = spawnEnemy(id, 3.5, 3.5)
    const view = buildEnemyView(def)
    const seeing = { distance: 0.5, hasLineOfSight: true, angleToPlayer: 0 }

    for (let t = 0; t < 6; t += STEP) {
      step(enemy.mind, def, seeing, STEP)
      poseEnemy(view, enemy, CELL, ROOM, STEP)
      expect(lowestPoint(view.group), `${id} in state ${enemy.mind.state}`).toBeGreaterThanOrEqual(
        -1e-6,
      )
    }
  })

  it('flattens as it dies rather than staying upright', () => {
    const enemy = spawnEnemy(id, 3.5, 3.5)
    const view = buildEnemyView(def)
    poseEnemy(view, enemy, CELL, ROOM, STEP)
    const aliveHeight = new THREE.Box3().setFromObject(view.group).max.y

    damage(enemy.mind, def, 9999, () => 1)
    for (let t = 0; t < def.dyingTime + 0.5; t += STEP) {
      step(enemy.mind, def, { distance: 9, hasLineOfSight: false, angleToPlayer: 0 }, STEP)
      poseEnemy(view, enemy, CELL, ROOM, STEP)
    }
    view.group.updateMatrixWorld(true)
    const deadHeight = new THREE.Box3().setFromObject(view.group).max.y

    expect(deadHeight).toBeLessThan(aliveHeight * 0.5)
  })

  it('sits at its grid position, scaled into world units', () => {
    const enemy = spawnEnemy(id, 3.5, 6.5)
    const view = buildEnemyView(def)
    poseEnemy(view, enemy, CELL, ROOM, STEP)
    expect(view.group.position.x).toBe(3.5 * CELL)
    expect(view.group.position.z).toBe(6.5 * CELL)
    expect(view.group.position.y).toBe(0)
  })
})

describe('googly eyes', () => {
  const def = ENEMIES.grub

  it('hangs the pupils at the bottom of the eyeballs when still', () => {
    const enemy = spawnEnemy('grub', 3.5, 3.5)
    const view = buildEnemyView(def)
    for (let t = 0; t < 3; t += STEP) poseEnemy(view, enemy, CELL, ROOM, STEP)

    expect(view.googlyAngle).toBeCloseTo(0, 2)
    for (const pupil of view.pupils) {
      // Straight down from the eyeball centre at y = 0.9.
      expect(pupil.position.y).toBeLessThan(0.9)
    }
  })

  it('swings the pupils when the slug moves sideways', () => {
    const enemy = spawnEnemy('grub', 3.5, 3.5)
    const view = buildEnemyView(def)
    poseEnemy(view, enemy, CELL, ROOM, STEP)

    // Facing 0 means right is +x, so moving in +x is pure lateral motion.
    for (let i = 0; i < 12; i++) {
      enemy.x += 0.06
      poseEnemy(view, enemy, CELL, ROOM, STEP)
    }
    expect(Math.abs(view.googlyAngle)).toBeGreaterThan(0.05)
  })

  it('settles back to hanging once the slug stops', () => {
    const enemy = spawnEnemy('grub', 3.5, 3.5)
    const view = buildEnemyView(def)
    for (let i = 0; i < 12; i++) {
      enemy.x += 0.06
      poseEnemy(view, enemy, CELL, ROOM, STEP)
    }
    for (let t = 0; t < 4; t += STEP) poseEnemy(view, enemy, CELL, ROOM, STEP)
    expect(Math.abs(view.googlyAngle)).toBeLessThan(0.05)
  })

  it('never flings a pupil off the eyeball, however violently the slug moves', () => {
    // The pendulum is driven by the creature's own acceleration, so a teleport
    // or a very fast frame injects a huge impulse. Clamped, or the pupil spins
    // over the top and reads as broken rather than funny.
    const enemy = spawnEnemy('grub', 3.5, 3.5)
    const view = buildEnemyView(def)
    // Sustained in ONE direction. The first version alternated each frame, so
    // the impulses cancelled and the pendulum barely moved -- the stress test
    // was not stressing anything.
    for (let i = 0; i < 200; i++) {
      enemy.x += 0.5
      poseEnemy(view, enemy, CELL, ROOM, STEP)
      expect(Number.isFinite(view.googlyAngle)).toBe(true)

      // The observable invariant: a pupil hangs in the LOWER half of its
      // eyeball. Swing it past horizontal and it starts climbing, and past
      // vertical it is over the top and spinning.
      //
      // Deliberately not asserted against GOOGLY_LIMIT. Two earlier versions
      // of this were worthless: pupil distance is bounded by sin/cos whatever
      // the angle does, and comparing the angle to the very constant that
      // clamps it is a tautology -- raise the constant and the assertion
      // raises with it. This compares against the eyeball's own centre.
      for (const pupil of view.pupils) {
        expect(pupil.position.y, 'pupil climbed above its eyeball centre').toBeLessThan(0.9)
      }
    }
  })

  it('does not move the pupils on the first frame, however far from the origin', () => {
    // lastX/lastZ start at 0 and the enemy does not, so differencing against
    // them on frame one reports the enemy's whole distance from the origin
    // divided by a tick -- hundreds of cells per second. A slug spawned far
    // out would start with its pupils pinned to the side of its head.
    for (const [x, z] of [
      [0.5, 0.5],
      [9.5, 9.5],
      [18.5, 15.5],
    ] as const) {
      const enemy = spawnEnemy('grub', x, z)
      const view = buildEnemyView(def)
      poseEnemy(view, enemy, CELL, ROOM, STEP)
      expect(view.googlyAngle, `spawned at ${x},${z}`).toBe(0)
      expect(view.googlyVelocity, `spawned at ${x},${z}`).toBe(0)
    }
  })
})
