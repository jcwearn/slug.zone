import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { parseLevel } from './level.ts'
import { loadWorld, respawnEnemies, unloadWorld } from './scene.ts'
import { LEVELS } from './levels/index.ts'

/**
 * The scene graph's bookkeeping across a level change.
 *
 * Only `engine/textures.ts` is stubbed, and only because it paints its art on a
 * 2D canvas that does not exist outside a browser. Everything else here is the
 * real thing: real geometry, real doors, real creature bodies. What is being
 * tested is not how any of it looks -- rendering is not tested in this repo --
 * but whether a level that has been unloaded actually left.
 *
 * That matters because both ways of getting it wrong are silent. Forget to
 * remove a Group and the previous level's slugs and pickups keep drawing,
 * embedded in the new geometry. Dispose one of the SHARED caches and every
 * creature on every later level is built on disposed geometry.
 */
vi.mock('../engine/textures.ts', () => ({
  texture: () => new THREE.Texture(),
  disposeTextures: () => {},
}))

/** The first geometry in a view, as an identity to compare across loads. */
function geometryOf(group: THREE.Object3D): THREE.BufferGeometry | undefined {
  let found: THREE.BufferGeometry | undefined
  group.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!found && mesh.geometry) found = mesh.geometry
  })
  return found
}

const e1m1 = parseLevel(LEVELS[0])
const e1m2 = parseLevel(LEVELS[1])

describe('loadWorld', () => {
  it('builds a view for every creature and every pickup on the level', () => {
    const world = loadWorld(e1m1, new THREE.Scene())
    const entities = e1m1.entities
    expect(world.live).toHaveLength(entities.filter((e) => e.type !== 'pickup').length)
    expect(world.pickups).toHaveLength(entities.filter((e) => e.type === 'pickup').length)
    // Indexed together by main.ts's pose loop, so a mismatch poses the wrong
    // item at the wrong place -- or reads past the end.
    expect(world.pickupViews).toHaveLength(world.pickups.length)
  })

  it('takes its scale from the level rather than assuming one', () => {
    expect(loadWorld(e1m1, new THREE.Scene()).s).toBe(e1m1.cellSize)
  })

  it('sizes the fog-of-war grid to the level it was given', () => {
    // `Explored` is allocated width*height and indexed with that stride. Reuse
    // one across levels of different shapes and the map draws sheared, with
    // out-of-range cells dropped rather than throwing.
    const one = loadWorld(e1m1, new THREE.Scene())
    const two = loadWorld(e1m2, new THREE.Scene())
    expect(one.explored.seen.length).toBe(e1m1.width * e1m1.height)
    expect(two.explored.seen.length).toBe(e1m2.width * e1m2.height)
    expect(one.explored.seen.length).not.toBe(two.explored.seen.length)
  })

  it('parses fresh, so doors opened on a previous visit are shut again', () => {
    // `cell.open` is runtime state written onto the Level. A re-entered level
    // that kept its parsed object would start with every door it had ever
    // opened still standing open.
    const first = parseLevel(LEVELS[0])
    const world = loadWorld(first, new THREE.Scene())
    for (const door of world.doors) first.cells[door.z * first.width + door.x].open = true

    const second = parseLevel(LEVELS[0])
    const reopened = loadWorld(second, new THREE.Scene())
    for (const door of reopened.doors) {
      expect(second.cells[door.z * second.width + door.x].open ?? false).toBe(false)
    }
  })
})

describe('unloadWorld', () => {
  it('leaves the scene as empty as it found it', () => {
    const scene = new THREE.Scene()
    scene.add(new THREE.AmbientLight())
    const before = scene.children.length

    const world = loadWorld(e1m1, scene)
    expect(scene.children.length).toBeGreaterThan(before)

    unloadWorld(world, scene)
    expect(scene.children.length, 'something from the old level is still in the scene').toBe(before)
  })

  it('leaves nothing behind across a whole episode of transitions', () => {
    const scene = new THREE.Scene()
    let world = loadWorld(e1m1, scene)
    const settled = scene.children.length

    for (const source of [...LEVELS, ...LEVELS]) {
      unloadWorld(world, scene)
      world = loadWorld(parseLevel(source), scene)
    }
    // Not an equality against `settled`, because levels hold different numbers
    // of creatures. What must not happen is unbounded growth.
    expect(scene.children.length).toBeLessThanOrEqual(settled * 3)
  })

  it('leaves the shared creature geometry intact for the next level', () => {
    // Creature bodies are cut from a module-level cache keyed by type, so the
    // same kind of slug on two levels is the same geometry instance. Disposing
    // that cache on a transition -- which is the obvious-looking thing to add
    // here -- throws away work every subsequent level has to redo.
    //
    // Asserted as identity rather than as "the geometry still has vertices":
    // three.js leaves `attributes` in place after `dispose()`, so inspecting
    // them cannot tell a live geometry from a disposed one and a test written
    // that way passes whatever this function does.
    const scene = new THREE.Scene()
    const first = loadWorld(e1m1, scene)
    const grub = first.live.find((l) => l.enemy.def.id === 'grub')
    expect(grub, 'e1m1 should still have a Grub on it').toBeDefined()
    const before = geometryOf(grub!.view.group)

    unloadWorld(first, scene)

    const second = loadWorld(e1m2, scene)
    const laterGrub = second.live.find((l) => l.enemy.def.id === 'grub')
    expect(laterGrub, 'e1m2 should still have a Grub on it').toBeDefined()
    expect(geometryOf(laterGrub!.view.group)).toBe(before)
  })
})

describe('respawnEnemies', () => {
  it('puts every creature back where the level put it', () => {
    const world = loadWorld(e1m1, new THREE.Scene())
    for (const entry of world.live) {
      entry.enemy.x += 3
      entry.enemy.mind.hp = 1
      entry.wasIdle = false
    }

    respawnEnemies(world)
    for (const entry of world.live) {
      expect(entry.enemy.x).toBe(entry.spawnX)
      expect(entry.enemy.z).toBe(entry.spawnZ)
      expect(entry.enemy.mind.hp).toBe(entry.enemy.def.hp)
      expect(entry.wasIdle).toBe(true)
    }
  })

  it('keeps the views, so a restart does not leak a scene full of corpses', () => {
    const scene = new THREE.Scene()
    const world = loadWorld(e1m1, scene)
    const views = world.live.map((l) => l.view)
    const children = scene.children.length

    respawnEnemies(world)
    expect(world.live.map((l) => l.view)).toEqual(views)
    expect(scene.children.length).toBe(children)
  })
})
