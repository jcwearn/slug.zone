import * as THREE from 'three'
import type { Pickup } from './pickups.ts'
import type { ItemDef } from './types.ts'

/**
 * Item meshes, built from primitives in code.
 *
 * Same trade as the enemies: no assets to host, and a shape made of two boxes
 * reads better at 320x200 than a detailed model would. Geometry is cached per
 * SHAPE and materials per COLOUR, so ten boxes of coarse are ten transforms
 * rather than ten uploads.
 *
 * Everything is authored in a local space one unit tall sitting on y=0, and the
 * group is scaled by `def.height * roomHeight`. X and Z scale by cellSize and Y
 * does not -- the split `world/space.ts` exists to enforce.
 */

const geoCache = new Map<string, THREE.BufferGeometry[]>()
const matCache = new Map<number, THREE.Material>()

/** How far an item rises and falls, as a fraction of its own height. */
const BOB_HEIGHT = 0.22
const BOB_SPEED = 2.2
const SPIN_SPEED = 1.4

function geometryFor(shape: ItemDef['shape']): THREE.BufferGeometry[] {
  let parts = geoCache.get(shape)
  if (parts) return parts

  switch (shape) {
    case 'cross':
      parts = [new THREE.BoxGeometry(1, 0.34, 0.34), new THREE.BoxGeometry(0.34, 1, 0.34)]
      break
    case 'shield':
      parts = [new THREE.OctahedronGeometry(0.62, 0), new THREE.BoxGeometry(0.5, 0.5, 0.16)]
      break
    case 'box':
      parts = [new THREE.BoxGeometry(1, 0.7, 0.7), new THREE.BoxGeometry(1.04, 0.24, 0.74)]
      break
    case 'gun':
      parts = [new THREE.BoxGeometry(1.3, 0.3, 0.3), new THREE.CylinderGeometry(0.2, 0.26, 0.5, 6)]
      break
    case 'card':
      parts = [new THREE.BoxGeometry(0.8, 1, 0.1), new THREE.BoxGeometry(0.5, 0.22, 0.14)]
      break
  }

  geoCache.set(shape, parts)
  return parts
}

function materialFor(color: number): THREE.Material {
  let mat = matCache.get(color)
  if (!mat) {
    // Emissive at a fraction of the base colour: an item in an unlit corner of
    // a foggy cellar is an item nobody finds, and the lantern only reaches so
    // far. Bright enough to spot, not bright enough to read as a light source.
    mat = new THREE.MeshLambertMaterial({
      color,
      emissive: new THREE.Color(color).multiplyScalar(0.35),
      flatShading: true,
    })
    matCache.set(color, mat)
  }
  return mat
}

export interface PickupView {
  group: THREE.Group
  /** Spun and bobbed; the group itself carries the world position. */
  body: THREE.Group
  /** Lift that puts the body's lowest vertex on y=0. */
  restY: number
}

export function buildPickupView(def: ItemDef): PickupView {
  const parts = geometryFor(def.shape)
  const mat = materialFor(def.color)
  const trim = materialFor(0x1d2a16)

  const group = new THREE.Group()
  const body = new THREE.Group()
  group.add(body)

  const main = new THREE.Mesh(parts[0], mat)
  const detail = new THREE.Mesh(parts[1], def.shape === 'box' ? trim : mat)
  body.add(main, detail)

  if (def.shape === 'gun') {
    detail.rotation.z = Math.PI / 2
    detail.position.set(-0.45, -0.2, 0)
  }

  // Lift measured from the geometry rather than guessed per shape, so the
  // lowest vertex lands exactly on y=0. The floor is a plane at exactly 0 and
  // anything below it visibly slices through the ground; a hand-picked 0.5
  // works for a box and puts a shield's bottom point through the floor.
  //
  // Measured once at build: rotating about Y cannot change a Y extent, so the
  // spin never invalidates it.
  body.updateMatrixWorld(true)
  const restY = -new THREE.Box3().setFromObject(body).min.y
  body.position.y = restY

  return { group, body, restY }
}

/**
 * Spin, bob, and hide what has been collected.
 *
 * `age` rather than accumulated dt so two identical items dropped in the same
 * room stay in phase with each other and the whole floor pulses together.
 */
export function posePickup(
  view: PickupView,
  pickup: Pickup,
  cellSize: number,
  roomHeight: number,
  age: number,
): void {
  view.group.visible = !pickup.taken
  if (pickup.taken) return

  const scale = pickup.def.height * roomHeight
  view.group.position.set(pickup.x * cellSize, 0, pickup.z * cellSize)
  view.group.scale.setScalar(scale)

  view.body.rotation.y = age * SPIN_SPEED
  // Shifted sine, so the trough of the bob is the resting height rather than
  // half a bob below it. A centred sine sinks every item into the floor for
  // half of every cycle.
  view.body.position.y = view.restY + (Math.sin(age * BOB_SPEED) * 0.5 + 0.5) * BOB_HEIGHT
}

export function disposePickupMeshes(): void {
  for (const parts of geoCache.values()) for (const g of parts) g.dispose()
  for (const m of matCache.values()) m.dispose()
  geoCache.clear()
  matCache.clear()
}
