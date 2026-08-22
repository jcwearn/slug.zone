import * as THREE from 'three'
import type { Enemy } from './enemy.ts'
import { PALE } from './definitions.ts'
import type { EnemyDef } from './types.ts'

/**
 * Low-poly slug bodies with a wet, flat-shaded look.
 *
 * Built from primitives in code rather than loaded as models: no assets to
 * host, and the shapes stay chunky enough to read at 320x200, where a detailed
 * mesh would just be mush.
 *
 * Geometries and materials are shared per enemy TYPE, not per instance -- a
 * room with a dozen Grubs should be a dozen transforms, not a dozen uploads.
 */

const shared = new Map<string, { geo: THREE.BufferGeometry[]; mats: THREE.Material[] }>()

function palette(def: EnemyDef) {
  let entry = shared.get(def.id)
  if (!entry) {
    entry = {
      geo: [
        new THREE.SphereGeometry(0.5, 7, 5),
        new THREE.SphereGeometry(0.16, 5, 4),
        new THREE.CylinderGeometry(0.045, 0.055, 0.45, 5),
      ],
      mats: [
        new THREE.MeshLambertMaterial({ color: def.color, flatShading: true }),
        new THREE.MeshLambertMaterial({ color: def.darkColor, flatShading: true }),
        new THREE.MeshLambertMaterial({ color: PALE, flatShading: true }),
        new THREE.MeshBasicMaterial({ color: 0x120c08 }),
      ],
    }
    shared.set(def.id, entry)
  }
  return entry
}

export interface EnemyView {
  group: THREE.Group
  /** Squashes on pain and collapses on death. */
  body: THREE.Group
}

export function buildEnemyView(def: EnemyDef): EnemyView {
  const { geo, mats } = palette(def)
  const [blobGeo, eyeGeo, stalkGeo] = geo
  const [skin, dark, pale, black] = mats

  const group = new THREE.Group()
  const body = new THREE.Group()
  group.add(body)

  // An elongated blob rather than a sphere: slugs are longer than they are
  // wide, and the taper is what tells you which end is the head.
  const trunk = new THREE.Mesh(blobGeo, skin)
  trunk.scale.set(0.75, 0.62, 1.25)
  trunk.position.y = 0.45
  body.add(trunk)

  const hump = new THREE.Mesh(blobGeo, dark)
  hump.scale.set(0.56, 0.5, 0.6)
  hump.position.set(0, 0.62, 0.12)
  body.add(hump)

  const head = new THREE.Mesh(blobGeo, skin)
  head.scale.set(0.5, 0.44, 0.5)
  head.position.set(0, 0.44, -0.6)
  body.add(head)

  // Eyestalks. Facing is -z, matching the player's forward convention.
  for (const side of [-1, 1]) {
    const stalk = new THREE.Mesh(stalkGeo, pale)
    stalk.position.set(side * 0.16, 0.72, -0.66)
    stalk.rotation.z = side * 0.22
    body.add(stalk)

    const eye = new THREE.Mesh(eyeGeo, black)
    eye.position.set(side * 0.2, 0.95, -0.68)
    body.add(eye)
  }

  const foot = new THREE.Mesh(blobGeo, dark)
  foot.scale.set(0.8, 0.12, 1.3)
  foot.position.y = 0.08
  body.add(foot)

  return { group, body }
}

/**
 * Pose the mesh for the enemy's current state.
 *
 * Slugs move by peristalsis, so the idle animation is a travelling squash
 * rather than a walk cycle -- there are no legs to swing.
 */
export function poseEnemy(view: EnemyView, enemy: Enemy, cellSize: number, roomHeight: number) {
  const { def, mind } = enemy
  const scale = def.height * roomHeight

  view.group.position.set(enemy.x * cellSize, 0, enemy.z * cellSize)
  view.group.rotation.y = enemy.facing
  view.group.scale.setScalar(scale)

  if (mind.state === 'dying' || mind.state === 'dead') {
    // Deflate into a puddle. `timer` counts down through dyingTime, so this
    // runs 0 -> 1 and then stays put once dead.
    //
    // Explicitly NO roll on Z. Rolling a flattened body about its own base
    // tips one end below y=0, and since the floor is a plane at exactly 0 the
    // corpse slices diagonally through it. Salted slugs shrivel rather than
    // topple anyway, so spreading outward while collapsing downward is both
    // the correct look and the one that cannot clip.
    const t =
      mind.state === 'dead' ? 1 : 1 - Math.max(0, mind.timer) / Math.max(def.dyingTime, 1e-6)
    const spread = 1 + t * 0.8
    view.body.scale.set(spread, Math.max(0.1, 1 - t * 0.9), spread * 1.1)
    view.body.rotation.z = 0
    view.body.position.y = 0
    return
  }

  view.body.rotation.z = 0

  if (mind.state === 'pain') {
    // A hard flinch, so a hit reads even when it does not kill.
    view.body.scale.set(1.22, 0.78, 1.1)
    return
  }

  if (mind.state === 'attack') {
    // Rear up through the windup, which is the telegraph.
    const t = 1 - Math.max(0, mind.timer) / Math.max(def.attackWindup, 1e-6)
    view.body.scale.set(1 - t * 0.15, 1 + t * 0.35, 1 - t * 0.2)
    return
  }

  const moving = mind.state === 'chase'
  const speed = moving ? 7 : 2
  const amount = moving ? 0.12 : 0.045
  const wave = Math.sin(enemy.age * speed)
  view.body.scale.set(1 - wave * amount * 0.5, 1 + wave * amount, 1 + wave * amount * 0.4)
}

export function disposeEnemyMeshes() {
  for (const { geo, mats } of shared.values()) {
    for (const g of geo) g.dispose()
    for (const m of mats) m.dispose()
  }
  shared.clear()
}
