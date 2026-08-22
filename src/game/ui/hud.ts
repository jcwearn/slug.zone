import * as THREE from 'three'
import { drawText, measureText } from './font.ts'
import { drawFace, FACE_HEIGHT, FACE_WIDTH } from './face.ts'
import { faceBucket, type PlayerHealth } from '../player/health.ts'
import type { Arsenal } from '../weapons/arsenal.ts'
import { definition } from '../weapons/arsenal.ts'

/**
 * The status bar, drawn to a canvas and blitted into the 320x200 target.
 *
 * Into the render target rather than as DOM, for the same reason the crosshair
 * is: a DOM HUD draws at the display's real resolution and puts crisp text
 * under a chunky world. This is redrawn only when something it shows actually
 * changes -- health, ammo, weapon, keys -- because repainting a canvas and
 * re-uploading the texture every frame for a number that changes twice a
 * minute is pure waste.
 */

const WIDTH = 320
// Tall enough for the 26px portrait plus its frame and a little breathing room.
const HEIGHT = 34
const LIME = '#54e508'
const DIM = '#2c7a06'
const RED = '#c8341a'
const BONE = '#e8e4d8'

export class Hud {
  readonly mesh: THREE.Mesh
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly texture: THREE.CanvasTexture
  /** What was last drawn, so an unchanged HUD is not redrawn. */
  private signature = ''

  constructor() {
    this.canvas = document.createElement('canvas')
    this.canvas.width = WIDTH
    this.canvas.height = HEIGHT
    const ctx = this.canvas.getContext('2d')
    if (!ctx) throw new Error('2d context unavailable')
    this.ctx = ctx

    this.texture = new THREE.CanvasTexture(this.canvas)
    this.texture.magFilter = THREE.NearestFilter
    this.texture.minFilter = THREE.NearestFilter
    this.texture.generateMipmaps = false
    this.texture.colorSpace = THREE.SRGBColorSpace

    // A unit quad; the HUD camera is orthographic over 0..1, so this maps
    // straight onto the bottom strip of the screen.
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthTest: false }),
    )
    const barHeight = HEIGHT / 200
    this.mesh.scale.set(1, barHeight, 1)
    this.mesh.position.set(0.5, barHeight / 2, 0)
  }

  update(health: PlayerHealth, arsenal: Arsenal, keys: Set<string>): void {
    const def = definition(arsenal)
    const ammo = def.ammo === null ? -1 : arsenal.ammo[def.ammo]
    const signature = [
      Math.ceil(health.hp),
      Math.ceil(health.armour),
      def.id,
      ammo,
      faceBucket(health),
      [...keys].sort().join(''),
    ].join('|')

    if (signature === this.signature) return
    this.signature = signature
    this.draw(health, arsenal, keys)
  }

  private draw(health: PlayerHealth, arsenal: Arsenal, keys: Set<string>): void {
    const ctx = this.ctx
    ctx.clearRect(0, 0, WIDTH, HEIGHT)

    ctx.fillStyle = 'rgba(6, 10, 4, 0.82)'
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
    ctx.fillStyle = DIM
    ctx.fillRect(0, 0, WIDTH, 1)

    // Health, left. Turns red under a quarter so the warning is peripheral --
    // you should not have to read a number to know you are in trouble.
    const critical = health.hp / health.hpMax <= 0.25
    drawText(ctx, 'HEALTH', 8, 5, DIM, 1)
    drawText(ctx, `${Math.ceil(health.hp)}%`, 8, 15, critical ? RED : LIME, 2)

    // Armour, next along, dimmed to nothing when there is none.
    drawText(ctx, 'ARMOUR', 70, 5, DIM, 1)
    drawText(ctx, `${Math.ceil(health.armour)}%`, 70, 15, health.armour > 0 ? LIME : DIM, 2)

    this.drawFace(faceBucket(health), 148, 4)

    // Keys, as three small pips. Present ones light up.
    const keyColours: [string, string][] = [
      ['red', '#c8341a'],
      ['blue', '#3a6ad0'],
      ['yellow', '#d0b23a'],
    ]
    keyColours.forEach(([name, colour], i) => {
      ctx.fillStyle = keys.has(name) ? colour : '#1d2a16'
      ctx.fillRect(196, 6 + i * 8, 6, 6)
    })

    // Weapon and ammo, right-aligned so the numbers do not jump about as they
    // change width.
    const def = definition(arsenal)
    const name = def.name.toUpperCase()
    drawText(ctx, name, WIDTH - 8 - measureText(name, 1), 5, DIM, 1)

    const ammoText = def.ammo === null ? '--' : `${arsenal.ammo[def.ammo]}`
    const empty = def.ammo !== null && arsenal.ammo[def.ammo] <= 0
    drawText(ctx, ammoText, WIDTH - 8 - measureText(ammoText, 2), 15, empty ? RED : BONE, 2)

    this.texture.needsUpdate = true
  }

  /**
   * The portrait, with a recessed frame around it.
   *
   * The face itself lives in face.ts as an editable pixel grid; this only
   * places and frames it.
   */
  private drawFace(bucket: number, x: number, y: number): void {
    const ctx = this.ctx
    ctx.fillStyle = '#0d1408'
    ctx.fillRect(x - 2, y - 2, FACE_WIDTH + 4, FACE_HEIGHT + 4)
    ctx.fillStyle = DIM
    ctx.fillRect(x - 2, y - 2, FACE_WIDTH + 4, 1)
    ctx.fillRect(x - 2, y + FACE_HEIGHT + 1, FACE_WIDTH + 4, 1)
    ctx.fillRect(x - 2, y - 2, 1, FACE_HEIGHT + 4)
    ctx.fillRect(x + FACE_WIDTH + 1, y - 2, 1, FACE_HEIGHT + 4)

    drawFace(ctx, bucket, x, y, 1)
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
    this.texture.dispose()
  }
}
