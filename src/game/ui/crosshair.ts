import * as THREE from 'three'

/**
 * A classic four-tick crosshair with a centre gap.
 *
 * Drawn into the 320x200 render target rather than as a DOM element over the
 * canvas. A DOM crosshair renders at the display's real resolution -- a
 * hairline-sharp cross over a chunky pixelated world, which breaks the look
 * immediately. Going through the render target gives it the same
 * nearest-neighbour upscale as everything else.
 *
 * The centre gap matters: a solid cross hides what you are aiming at, which at
 * this resolution can be most of a Grub.
 */

const TEX_SIZE = 32

function crosshairTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = TEX_SIZE
  canvas.height = TEX_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')

  const mid = TEX_SIZE / 2
  const gap = 3
  const len = 6
  const thickness = 2

  // Drawn twice: a dark pass offset one pixel, then lime on top. Without the
  // outline it disappears against a pale wall, and this level has several.
  const stroke = (colour: string, inset: number) => {
    ctx.fillStyle = colour
    ctx.fillRect(mid - thickness / 2 + inset, mid - gap - len + inset, thickness, len)
    ctx.fillRect(mid - thickness / 2 + inset, mid + gap + inset, thickness, len)
    ctx.fillRect(mid - gap - len + inset, mid - thickness / 2 + inset, len, thickness)
    ctx.fillRect(mid + gap + inset, mid - thickness / 2 + inset, len, thickness)
  }

  stroke('rgba(0,0,0,0.85)', 1)
  stroke('#54e508', 0)

  // Centre dot, so there is a precise point to aim with.
  ctx.fillStyle = '#eaffd6'
  ctx.fillRect(mid - 1, mid - 1, 2, 2)

  const tex = new THREE.CanvasTexture(canvas)
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export class Crosshair {
  readonly mesh: THREE.Mesh
  private readonly texture: THREE.Texture

  constructor() {
    this.texture = crosshairTexture()
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        fog: false,
      }),
    )
    // Dead centre of the overlay camera, in front of the weapon. renderOrder
    // keeps it above the viewmodel regardless of depth.
    this.mesh.position.set(0, 0, -0.05)
    this.mesh.scale.setScalar(0.016)
    this.mesh.renderOrder = 999
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
    this.texture.dispose()
  }
}
