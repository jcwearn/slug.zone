import * as THREE from 'three'
import { drawText, measureText } from './font.ts'
import type { Tally } from './tally.ts'

/**
 * The level-complete tally, drawn into the 320x200 target.
 *
 * A canvas rather than DOM, unlike `#dead`. The death screen gets away with
 * being DOM because it is two lines over a dark wash; this is the most
 * text-heavy screen in the game, and DOM text renders at the display's real
 * resolution -- crisp type over a hard-pixelated world, which reads as two
 * different products stitched together.
 *
 * Repainted only when a displayed integer changes, like the status bar.
 */

const WIDTH = 320
const HEIGHT = 200
const LIME = '#54e508'
const DIM = '#2c7a06'
const BONE = '#e8e4d8'
const GOLD = '#d0b23a'

export class Intermission {
  readonly mesh: THREE.Mesh
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly texture: THREE.CanvasTexture
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

    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthTest: false }),
    )
    this.mesh.position.set(0.5, 0.5, 0)
    // Above the status bar and the damage flash: this covers the screen.
    this.mesh.renderOrder = 10
    this.mesh.visible = false
  }

  /**
   * `nextName` is the level the click will take you to, or null at the end of
   * the episode. It joins the signature: without that, finishing two levels in
   * a row with identical row values and the same best time would match the
   * previous signature and leave the old caption on screen.
   */
  show(levelName: string, tally: Tally, nextName: string | null): void {
    this.mesh.visible = true
    const signature = [
      levelName,
      ...tally.rows.map((r) => Math.floor(r.value)),
      tally.done,
      tally.best,
      nextName ?? '',
    ].join('|')
    if (signature === this.signature) return
    this.signature = signature
    this.draw(levelName, tally, nextName)
  }

  hide(): void {
    this.mesh.visible = false
    // Cleared so the next level-complete repaints from scratch rather than
    // matching a stale signature and showing the previous run's numbers.
    this.signature = ''
  }

  private draw(levelName: string, tally: Tally, nextName: string | null): void {
    const ctx = this.ctx
    ctx.clearRect(0, 0, WIDTH, HEIGHT)
    ctx.fillStyle = 'rgba(4, 8, 3, 0.93)'
    ctx.fillRect(0, 0, WIDTH, HEIGHT)

    const centred = (text: string, y: number, colour: string, scale: number) =>
      drawText(ctx, text, Math.round((WIDTH - measureText(text, scale)) / 2), y, colour, scale)

    centred('LEVEL COMPLETE', 26, LIME, 2)
    centred(levelName.toUpperCase(), 46, DIM, 1)

    // Rows are laid out on a fixed grid rather than centred as a whole, so the
    // numbers do not shuffle sideways as they climb.
    const labelX = 78
    const valueRight = 242
    tally.rows.forEach((row, i) => {
      const y = 76 + i * 20
      drawText(ctx, row.label, labelX, y, DIM, 1)
      const text = `${Math.floor(row.value)}${row.suffix}`
      drawText(ctx, text, valueRight - measureText(text, 2), y - 5, BONE, 2)
    })

    if (tally.done) {
      drawText(ctx, 'TIME', labelX, 146, DIM, 1)
      drawText(ctx, tally.time, valueRight - measureText(tally.time, 1), 146, BONE, 1)

      drawText(ctx, 'PAR', labelX, 158, DIM, 1)
      drawText(ctx, tally.par, valueRight - measureText(tally.par, 1), 158, DIM, 1)

      if (tally.best) {
        drawText(ctx, tally.record ? 'RECORD' : 'BEST', labelX, 170, DIM, 1)
        const colour = tally.record ? GOLD : BONE
        drawText(ctx, tally.best, valueRight - measureText(tally.best, 1), 170, colour, 1)
      }

      if (nextName) {
        // Doom's two-line form. The level name is drawn dim so the instruction
        // stays the brightest thing on the screen -- it is what the click does.
        centred(`ENTERING ${nextName.toUpperCase()}`, 178, DIM, 1)
        centred('CLICK TO CONTINUE', 190, LIME, 1)
      } else {
        centred('CLICK TO PLAY AGAIN', 186, LIME, 1)
      }
    }

    this.texture.needsUpdate = true
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    const material = this.mesh.material as THREE.Material
    material.dispose()
    this.texture.dispose()
  }
}
