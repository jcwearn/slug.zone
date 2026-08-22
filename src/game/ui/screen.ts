import * as THREE from 'three'
import { Hud } from './hud.ts'
import type { PlayerHealth } from '../player/health.ts'
import type { Arsenal } from '../weapons/arsenal.ts'

/**
 * The screen-space layer: the status bar and the damage flash.
 *
 * Orthographic over 0..1 in both axes, so positions read as fractions of the
 * screen and nothing has to know the render target's pixel size.
 */
export class ScreenLayer {
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1)

  private readonly hud = new Hud()
  private readonly flash: THREE.Mesh
  private readonly flashMaterial: THREE.MeshBasicMaterial

  constructor() {
    this.scene.add(this.hud.mesh)

    // Full-screen red wash, additive so it tints rather than covers -- an
    // opaque overlay at any real strength hides the thing that is hitting you,
    // which is the worst possible moment to lose the picture.
    this.flashMaterial = new THREE.MeshBasicMaterial({
      color: 0xd02010,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    })
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.flashMaterial)
    this.flash.position.set(0.5, 0.5, 0)
    this.flash.renderOrder = -1
    this.scene.add(this.flash)
  }

  update(health: PlayerHealth, arsenal: Arsenal, keys: Set<string>): void {
    this.hud.update(health, arsenal, keys)
    // Capped well below 1: the flash should read as being hit, not as a
    // screen transition.
    this.flashMaterial.opacity = Math.min(0.55, health.painFlash * 0.55)
    this.flash.visible = this.flashMaterial.opacity > 0.002
  }

  dispose(): void {
    this.hud.dispose()
    this.flash.geometry.dispose()
    this.flashMaterial.dispose()
  }
}
