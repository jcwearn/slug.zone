import * as THREE from 'three'
import { Hud } from './hud.ts'
import { MessageLine, PROMPT_Y } from './message.ts'
import { Intermission } from './intermission.ts'
import { Minimap } from './minimap.ts'
import type { Tally } from './tally.ts'
import type { Explored } from '../world/explored.ts'
import type { Level } from '../world/level.ts'
import type { PlayerHealth } from '../player/health.ts'
import type { Arsenal } from '../weapons/arsenal.ts'
import type { Expression } from './face.ts'

/**
 * The screen-space layer: the status bar, the message line and the damage
 * flash.
 *
 * Orthographic over 0..1 in both axes, so positions read as fractions of the
 * screen and nothing has to know the render target's pixel size.
 */
export interface Notice {
  text: string
  colour: string
}

export class ScreenLayer {
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1)

  private readonly hud = new Hud()
  private readonly message = new MessageLine()
  private readonly prompt = new MessageLine(PROMPT_Y)
  private readonly intermission = new Intermission()
  private readonly minimap: Minimap
  private readonly flash: THREE.Mesh
  private readonly flashMaterial: THREE.MeshBasicMaterial

  constructor(level: Level) {
    this.minimap = new Minimap(level)
    this.scene.add(this.minimap.mesh)
    this.scene.add(this.hud.mesh)
    this.scene.add(this.message.mesh)
    this.scene.add(this.prompt.mesh)
    this.scene.add(this.intermission.mesh)

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

  update(
    health: PlayerHealth,
    arsenal: Arsenal,
    keys: Set<string>,
    expression: Expression = 'neutral',
    notice: Notice = { text: '', colour: '' },
    prompt: Notice = { text: '', colour: '' },
  ): void {
    this.hud.update(health, arsenal, keys, expression)
    this.message.update(notice.text, notice.colour)
    this.prompt.update(prompt.text, prompt.colour)
    // Capped well below 1: the flash should read as being hit, not as a
    // screen transition.
    this.flashMaterial.opacity = Math.min(0.55, health.painFlash * 0.55)
    this.flash.visible = this.flashMaterial.opacity > 0.002
  }

  /**
   * The automap. Hidden behind the tally, which covers the whole screen.
   */
  updateMinimap(
    level: Level,
    explored: Explored,
    x: number,
    z: number,
    yaw: number,
    charted: number,
  ): void {
    this.minimap.update(level, explored, x, z, yaw, charted)
  }

  /** Wipe the map for a fresh run. */
  clearMinimap(): void {
    this.minimap.invalidate()
  }

  /**
   * The level-complete tally, over everything else.
   *
   * Takes the tally OR null, and null hides it. Visibility is then a property
   * of whether a run has finished rather than something two call sites have to
   * remember to keep in step -- which they did not: restarting from the tally
   * nulled it and then fell through to this method, which turned the overlay
   * back on before throwing on the null it had just been handed.
   */
  showTally(levelName: string, tally: Tally | null, nextName: string | null): void {
    if (!tally) {
      this.intermission.hide()
      return
    }
    this.intermission.show(levelName, tally, nextName)
  }

  /**
   * Re-fit the automap for a new level.
   *
   * Only the minimap is level-shaped. The rest of the layer is not rebuilt on a
   * transition on purpose: `ui/face.ts` loads the portrait sheet through a
   * fresh `new Image()` per instance, so a rebuild would blank the HUD face
   * until the decode landed.
   */
  setLevel(level: Level): void {
    this.minimap.resize(level)
  }

  hideTally(): void {
    this.intermission.hide()
  }

  dispose(): void {
    this.hud.dispose()
    this.message.dispose()
    this.prompt.dispose()
    this.intermission.dispose()
    this.minimap.dispose()
    this.flash.geometry.dispose()
    this.flashMaterial.dispose()
  }
}
