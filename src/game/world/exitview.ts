import * as THREE from 'three'
import { LIME } from '../data/palette.ts'
import { isSolid, type Level } from './level.ts'

/**
 * The lit shrine that marks the way out.
 *
 * The exit used to be a single cell whose floor texture changed to green. In a
 * dark, foggy cellar at 320x200 that reads as nothing at all, so the level
 * ended when you wandered into a dead end -- which is precisely how it felt.
 *
 * Panels go on every solid wall of the exit cell rather than on one chosen
 * side, which needs no idea of which way the player will arrive from and turns
 * a one-cell alcove into something visible from the far end of the corridor.
 */

/** How far the panel floats off the wall, so it never z-fights with it. */
const INSET = 0.04
/** Fraction of the cell a panel spans. */
const SPAN = 0.62
/** Seconds for one full breath of the pulse. */
const PULSE_PERIOD = 2.4

export class ExitViews {
  readonly group = new THREE.Group()
  private readonly material: THREE.MeshBasicMaterial
  private readonly geometry: THREE.PlaneGeometry
  private readonly light: THREE.PointLight | null = null
  private age = 0

  constructor(level: Level) {
    const s = level.cellSize
    const h = level.wallHeight

    // MeshBasic, not Lambert: this is meant to look lit from within rather
    // than to take light from the lantern, which is the only thing that makes
    // it legible from the dark end of a corridor.
    this.material = new THREE.MeshBasicMaterial({
      color: LIME,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      fog: false,
    })
    // Y is NOT scaled by cellSize -- the room is `wallHeight` units tall.
    this.geometry = new THREE.PlaneGeometry(s * SPAN, h * SPAN)

    const exits = level.cells.filter((c) => c.exit)

    for (const cell of exits) {
      const centreX = (cell.x + 0.5) * s
      const centreZ = (cell.z + 0.5) * s

      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        if (!isSolid(level, cell.x + dx, cell.z + dz)) continue
        const panel = new THREE.Mesh(this.geometry, this.material)
        panel.position.set(centreX + dx * (s / 2 - INSET), h * 0.45, centreZ + dz * (s / 2 - INSET))
        // Faces turn about Y to look back into the cell. A panel on the east
        // wall is rotated a quarter turn from one on the south.
        panel.rotation.y = dx === 0 ? 0 : Math.PI / 2
        this.group.add(panel)
      }

      if (!this.light) {
        this.light = new THREE.PointLight(LIME, 26, s * 6, 1.8)
        this.light.position.set(centreX, h * 0.55, centreZ)
        this.group.add(this.light)
      }
    }
  }

  /** Breathe, so the eye catches it from down a corridor. */
  update(dt: number): void {
    this.age += dt
    const pulse = 0.5 + 0.5 * Math.sin((this.age / PULSE_PERIOD) * Math.PI * 2)
    this.material.opacity = 0.6 + pulse * 0.35
    if (this.light) this.light.intensity = 20 + pulse * 14
  }

  dispose(): void {
    this.geometry.dispose()
    this.material.dispose()
  }
}
