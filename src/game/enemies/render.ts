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
        new THREE.SphereGeometry(0.115, 6, 5),
        new THREE.SphereGeometry(0.048, 5, 4),
        new THREE.CylinderGeometry(0.038, 0.048, 0.42, 5),
      ],
      mats: [
        new THREE.MeshLambertMaterial({ color: def.color, flatShading: true }),
        new THREE.MeshLambertMaterial({ color: def.darkColor, flatShading: true }),
        new THREE.MeshLambertMaterial({ color: PALE, flatShading: true }),
        new THREE.MeshLambertMaterial({ color: 0xf4f0dc, flatShading: true }),
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
  /** The two pupils, swung by the googly pendulum below. */
  pupils: THREE.Mesh[]
  /** Pendulum state: angle from straight-down, and its velocity. */
  googlyAngle: number
  googlyVelocity: number
  /** Previous position, to derive the lateral motion that drives the swing. */
  lastX: number
  lastZ: number
  /**
   * Whether lastX/lastZ hold a real previous position yet.
   *
   * They start at 0,0 and the enemy does not, so differencing against them on
   * the first frame reports a velocity of the enemy's whole distance from the
   * origin divided by one tick -- a few hundred cells per second, which
   * catapults the pupils. The flag is the difference between "has not moved"
   * and "has no history".
   */
  seeded: boolean
}

/**
 * Googly-eye pendulum.
 *
 * A real googly eye is a disc that hangs at the bottom of its dome and swings
 * when you move it, so it is a damped pendulum driven by the creature's own
 * lateral acceleration -- not a wobble on a timer, which reads as a twitch
 * rather than as weight.
 *
 * GRAVITY sets how insistently the pupil returns to the bottom, DAMPING how
 * quickly the swing dies, and DRIVE how hard the slug's movement throws it.
 */
const GOOGLY_GRAVITY = 34
const GOOGLY_DAMPING = 2.6
const GOOGLY_DRIVE = 7
/** How far the pupil sits from the eyeball's centre. */
const PUPIL_ORBIT = 0.055
/**
 * How far the pupil may swing from straight-down, in radians.
 *
 * Past roughly this the pupil is climbing the side of the eyeball, and without
 * a limit a big enough impulse sends it right over the top and spinning, which
 * reads as broken rather than funny. Exported so the test asserts the actual
 * bound rather than a number copied from here.
 */
export const GOOGLY_LIMIT = 1.35

export function buildEnemyView(def: EnemyDef): EnemyView {
  const { geo, mats } = palette(def)
  const [blobGeo, eyeGeo, pupilGeo, stalkGeo] = geo
  const [skin, dark, pale, sclera, pupil] = mats

  const group = new THREE.Group()
  const body = new THREE.Group()
  group.add(body)
  const pupils: THREE.Mesh[] = []

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
    stalk.position.set(side * 0.14, 0.7, -0.65)
    stalk.rotation.z = side * 0.22
    body.add(stalk)

    // Big white eyeball with a loose dark pupil -- googly eyes.
    //
    // The originals were solid black spheres of radius 0.16 against a head of
    // radius 0.25, which read as two balloons stuck to a slug. Making them
    // white with a smaller pupil is what turns them into eyes, and letting the
    // pupil hang and swing is what makes them funny.
    const eye = new THREE.Mesh(eyeGeo, sclera)
    eye.position.set(side * 0.155, 0.9, -0.66)
    body.add(eye)

    const iris = new THREE.Mesh(pupilGeo, pupil)
    // Parked at the eyeball's centre; poseEnemy swings it each frame. Slightly
    // forward of the eyeball so it never sinks inside it.
    iris.position.set(side * 0.155, 0.9, -0.755)
    body.add(iris)
    pupils.push(iris)
  }

  const foot = new THREE.Mesh(blobGeo, dark)
  foot.scale.set(0.8, 0.12, 1.3)
  foot.position.y = 0.08
  body.add(foot)

  return {
    group,
    body,
    pupils,
    googlyAngle: 0,
    googlyVelocity: 0,
    lastX: 0,
    lastZ: 0,
    seeded: false,
  }
}

/**
 * Pose the mesh for the enemy's current state.
 *
 * Slugs move by peristalsis, so the idle animation is a travelling squash
 * rather than a walk cycle -- there are no legs to swing.
 */
export function poseEnemy(
  view: EnemyView,
  enemy: Enemy,
  cellSize: number,
  roomHeight: number,
  dt = 0,
) {
  swingPupils(view, enemy, dt)

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

/**
 * Advance the googly pendulum and place the pupils.
 *
 * Driven by the slug's own lateral movement: `lateral` is its velocity
 * projected onto its right vector, so turning and strafing throw the pupils
 * sideways while charging straight at you barely moves them. That difference
 * is the whole joke.
 *
 * The first call only records the position: with no previous frame to
 * difference against there is no velocity, and inventing one from the origin
 * launches the pupils across the eyeball.
 */
function swingPupils(view: EnemyView, enemy: Enemy, dt: number): void {
  if (dt > 0 && view.seeded) {
    const vx = (enemy.x - view.lastX) / dt
    const vz = (enemy.z - view.lastZ) / dt

    // Right vector for the shared facing convention, forward = (-sin, -cos).
    const rightX = Math.cos(enemy.facing)
    const rightZ = -Math.sin(enemy.facing)
    const lateral = vx * rightX + vz * rightZ

    const acceleration =
      -GOOGLY_GRAVITY * Math.sin(view.googlyAngle) -
      GOOGLY_DAMPING * view.googlyVelocity -
      lateral * GOOGLY_DRIVE

    view.googlyVelocity += acceleration * dt
    view.googlyAngle += view.googlyVelocity * dt

    if (view.googlyAngle > GOOGLY_LIMIT) {
      view.googlyAngle = GOOGLY_LIMIT
      view.googlyVelocity = Math.min(0, view.googlyVelocity)
    } else if (view.googlyAngle < -GOOGLY_LIMIT) {
      view.googlyAngle = -GOOGLY_LIMIT
      view.googlyVelocity = Math.max(0, view.googlyVelocity)
    }
  }

  view.lastX = enemy.x
  view.lastZ = enemy.z
  view.seeded = true

  const offsetX = Math.sin(view.googlyAngle) * PUPIL_ORBIT
  const offsetY = -Math.cos(view.googlyAngle) * PUPIL_ORBIT

  for (let i = 0; i < view.pupils.length; i++) {
    const side = i === 0 ? -1 : 1
    const pupil = view.pupils[i]
    // A touch of phase difference between the two, so they do not move as one
    // rigid unit. Googly eyes never quite agree with each other.
    const skew = 1 + side * 0.12
    pupil.position.x = side * 0.155 + offsetX * skew
    pupil.position.y = 0.9 + offsetY
  }
}
