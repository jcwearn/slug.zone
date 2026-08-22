import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { buildPickupView, posePickup } from './render.ts'
import { ITEMS } from './definitions.ts'
import type { Pickup } from './pickups.ts'

/**
 * Item meshes are primitives with plain colour materials -- no canvas textures
 * -- so the posing can be checked in a plain node test, exactly as the enemy
 * bodies are.
 *
 * The property that matters is geometric, not aesthetic: the floor is a plane
 * at exactly y=0, so anything that dips below it visibly slices through the
 * ground. A per-shape lift guessed by hand gets this right for a box and wrong
 * for a shield, which is why the lift is measured from the geometry.
 */

const CELL = 4
const ROOM = 4

function lowestPoint(object: THREE.Object3D): number {
  object.updateMatrixWorld(true)
  return new THREE.Box3().setFromObject(object).min.y
}

describe.each(Object.values(ITEMS).map((d) => [d.id, d] as const))('%s', (_id, def) => {
  const pickup = (): Pickup => ({ def, x: 3.5, z: 4.5, taken: false })

  it('never dips below the floor at any point in the bob', () => {
    const view = buildPickupView(def)
    const item = pickup()

    // Sampled across more than a full cycle of both the bob and the spin, so
    // no phase of either can sneak a corner under the floor.
    for (let age = 0; age < 8; age += 1 / 30) {
      posePickup(view, item, CELL, ROOM, age)
      expect(lowestPoint(view.group), `at age ${age.toFixed(2)}`).toBeGreaterThanOrEqual(-1e-6)
    }
  })

  it('stays under the ceiling', () => {
    // The bob is a fraction of the item's own height, so this is only in
    // danger if an item is ever given a height near 1. Cheap to hold.
    const view = buildPickupView(def)
    const item = pickup()
    for (let age = 0; age < 4; age += 1 / 30) {
      posePickup(view, item, CELL, ROOM, age)
      view.group.updateMatrixWorld(true)
      expect(new THREE.Box3().setFromObject(view.group).max.y).toBeLessThan(ROOM)
    }
  })

  it('sits at its cell in world units, with X and Z scaled and Y not', () => {
    const view = buildPickupView(def)
    posePickup(view, pickup(), CELL, ROOM, 0)
    expect(view.group.position.x).toBe(3.5 * CELL)
    expect(view.group.position.z).toBe(4.5 * CELL)
    // The bug worldSpace exists to prevent: Y scaled by cellSize as well would
    // put a knee-high item above a four-unit ceiling.
    expect(view.group.position.y).toBe(0)
    expect(lowestPoint(view.group)).toBeLessThan(ROOM * def.height)
  })

  it('vanishes once collected', () => {
    const view = buildPickupView(def)
    const item = pickup()
    posePickup(view, item, CELL, ROOM, 0)
    expect(view.group.visible).toBe(true)

    item.taken = true
    posePickup(view, item, CELL, ROOM, 0)
    expect(view.group.visible).toBe(false)
  })
})
