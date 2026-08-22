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
      poseEnemy(view, enemy, CELL, ROOM)
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
      poseEnemy(view, enemy, CELL, ROOM)
      expect(lowestPoint(view.group), `${id} in state ${enemy.mind.state}`).toBeGreaterThanOrEqual(
        -1e-6,
      )
    }
  })

  it('flattens as it dies rather than staying upright', () => {
    const enemy = spawnEnemy(id, 3.5, 3.5)
    const view = buildEnemyView(def)
    poseEnemy(view, enemy, CELL, ROOM)
    const aliveHeight = new THREE.Box3().setFromObject(view.group).max.y

    damage(enemy.mind, def, 9999, () => 1)
    for (let t = 0; t < def.dyingTime + 0.5; t += STEP) {
      step(enemy.mind, def, { distance: 9, hasLineOfSight: false, angleToPlayer: 0 }, STEP)
      poseEnemy(view, enemy, CELL, ROOM)
    }
    view.group.updateMatrixWorld(true)
    const deadHeight = new THREE.Box3().setFromObject(view.group).max.y

    expect(deadHeight).toBeLessThan(aliveHeight * 0.5)
  })

  it('sits at its grid position, scaled into world units', () => {
    const enemy = spawnEnemy(id, 3.5, 6.5)
    const view = buildEnemyView(def)
    poseEnemy(view, enemy, CELL, ROOM)
    expect(view.group.position.x).toBe(3.5 * CELL)
    expect(view.group.position.z).toBe(6.5 * CELL)
    expect(view.group.position.y).toBe(0)
  })
})
