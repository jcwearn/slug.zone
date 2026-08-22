import * as THREE from 'three'
import { LIME } from '../data/palette.ts'
import type { Arsenal } from './arsenal.ts'
import { LOWER_TIME } from './arsenal.ts'
import { WEAPONS } from './definitions.ts'
import { Crosshair } from '../ui/crosshair.ts'

/**
 * The weapon in the player's hands, plus the muzzle flash.
 *
 * Drawn in its own scene with its own camera rather than parented to the world
 * camera. Two reasons, both of which bite the parented approach: world fog
 * would tint the weapon as though it were metres away, and a weapon close
 * enough to fill the corner of the screen clips through walls the moment you
 * stand next to one.
 */

export class Viewmodel {
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(60, 320 / 200, 0.01, 10)

  private readonly root = new THREE.Group()
  private readonly shaker: THREE.Group
  private readonly grinder: THREE.Group
  private readonly flash: THREE.Mesh
  private readonly crosshair = new Crosshair()
  private flashTimer = 0
  private kick = 0

  constructor() {
    this.camera.position.set(0, 0, 0)
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.9))
    const key = new THREE.DirectionalLight(0xffffff, 1.1)
    key.position.set(-0.5, 1, 1)
    this.scene.add(key)

    this.shaker = buildSaltShaker()
    this.grinder = buildGrinder()
    this.grinder.visible = false
    this.root.add(this.shaker, this.grinder)

    // Bottom-right, angled in. The offsets are eyeballed against the 320x200
    // target -- at this resolution a few pixels is a large move.
    this.root.position.set(0.17, -0.2, -0.42)
    this.root.rotation.set(0, -0.22, 0.06)
    this.scene.add(this.root)

    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.12, 0.12),
      new THREE.MeshBasicMaterial({
        color: 0xffffe0,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
      }),
    )
    this.flash.position.set(0, 0.04, -0.16)
    this.flash.visible = false
    this.root.add(this.flash)

    // Added to the scene, not to `root` -- the crosshair must stay dead centre
    // while the weapon sways, bobs and kicks around it.
    this.scene.add(this.crosshair.mesh)
  }

  onFire(): void {
    this.flashTimer = 0.05
    this.kick = 1
  }

  update(arsenal: Arsenal, dt: number, bobPhase: number, moving: boolean): void {
    this.shaker.visible = arsenal.current === 'saltshaker'
    this.grinder.visible = arsenal.current === 'grinder'

    this.flashTimer = Math.max(0, this.flashTimer - dt)
    this.flash.visible = this.flashTimer > 0
    if (this.flash.visible) {
      // Spin the flash a little each shot so repeated fire does not look like
      // one static sprite blinking.
      this.flash.rotation.z += dt * 30
      this.flash.scale.setScalar(0.8 + Math.random() * 0.5)
    }

    this.kick = Math.max(0, this.kick - dt * 9)

    // Lowered fully at the bottom of a switch, back up when ready.
    let switchDrop = 0
    if (arsenal.phase === 'lowering') {
      switchDrop = 1 - Math.max(0, arsenal.timer) / LOWER_TIME
    } else if (arsenal.phase === 'raising') {
      const raise = WEAPONS[arsenal.current].raiseTime
      switchDrop = Math.max(0, arsenal.timer) / raise
    }

    const sway = moving ? Math.sin(bobPhase) * 0.012 : 0
    const bounce = moving ? Math.abs(Math.cos(bobPhase)) * 0.008 : 0

    this.root.position.x = 0.17 + sway
    this.root.position.y = -0.2 - switchDrop * 0.35 + bounce - this.kick * 0.02
    this.root.position.z = -0.42 + this.kick * 0.05
    this.root.rotation.x = this.kick * 0.16
  }

  dispose(): void {
    this.crosshair.dispose()
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose()
        const mat = obj.material
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else mat.dispose()
      }
    })
  }
}

const metal = (color: number) => new THREE.MeshLambertMaterial({ color, flatShading: true })

/** A salt shaker: tapered body, domed perforated cap. */
function buildSaltShaker(): THREE.Group {
  const group = new THREE.Group()

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.19, 8), metal(0xe8e4d8))
  body.position.set(0, -0.02, 0)
  group.add(body)

  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.052, 0.05, 8), metal(0xb0b4bc))
  cap.position.set(0, 0.095, 0)
  group.add(cap)

  // Perforations, which are what make it read as a shaker rather than a bottle.
  const holeGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.012, 5)
  const holeMat = metal(0x2a2a2e)
  for (const [hx, hz] of [
    [0, 0],
    [0.02, 0.012],
    [-0.02, 0.012],
    [0.02, -0.012],
    [-0.02, -0.012],
  ]) {
    const hole = new THREE.Mesh(holeGeo, holeMat)
    hole.position.set(hx, 0.12, hz)
    group.add(hole)
  }

  group.rotation.x = -0.35
  return group
}

/** The Grinder: a twin-barrel pepper mill. */
function buildGrinder(): THREE.Group {
  const group = new THREE.Group()

  const wood = metal(0x6b4a2a)
  const left = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.26, 8), wood)
  left.position.set(-0.035, 0, 0)
  const right = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.26, 8), wood)
  right.position.set(0.035, 0, 0)
  group.add(left, right)

  const collar = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.035, 0.075), metal(0x8a8f98))
  collar.position.set(0, -0.06, 0)
  group.add(collar)

  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 6), metal(0x3a3a40))
  knob.position.set(0, 0.15, 0)
  group.add(knob)

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.09, 0.05), metal(0x4a3220))
  grip.position.set(0, -0.13, 0.02)
  grip.rotation.x = 0.25
  group.add(grip)

  group.rotation.x = -0.35
  return group
}

export const VIEWMODEL_ACCENT = LIME
