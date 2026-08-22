import * as THREE from 'three'

/**
 * The hybrid look: real 3D geometry, rendered at 320x200, then blitted to the
 * canvas at a whole-number scale with nearest-neighbour filtering.
 *
 * Rendering small and scaling up is the entire effect. Doing it the other way
 * -- rendering at native resolution and shrinking the textures -- gives you
 * crisp polygon edges with blurry surfaces, which reads as "low quality
 * modern" rather than "1994". Chunky *edges* are what sell it.
 *
 * Three details matter and all three are easy to lose:
 *
 *  - setPixelRatio(1). Left at devicePixelRatio, a retina display renders the
 *    blit quad at 2x and every pixel gets resampled, undoing the whole thing.
 *  - NearestFilter on both min and mag of the render target.
 *  - An INTEGER upscale. 2.5x makes some source pixels two screen pixels wide
 *    and others three, which shimmers horribly when you turn. Better to
 *    letterbox a few dozen pixels of black than to ship a non-integer scale.
 */

export const RT_WIDTH = 320
export const RT_HEIGHT = 200

export class RetroRenderer {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera

  private readonly target: THREE.WebGLRenderTarget
  private readonly blitScene = new THREE.Scene()
  private readonly blitCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false })
    // Not devicePixelRatio. See the note above -- this is load-bearing.
    this.renderer.setPixelRatio(1)

    this.target = new THREE.WebGLRenderTarget(RT_WIDTH, RT_HEIGHT, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
    })

    // 200/320 is 5:8, but the source is displayed at the canvas's aspect, so
    // the camera uses the RT's own ratio and the letterboxing handles the rest.
    this.camera = new THREE.PerspectiveCamera(75, RT_WIDTH / RT_HEIGHT, 0.1, 200)

    this.blitScene.add(
      new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        new THREE.MeshBasicMaterial({ map: this.target.texture, depthTest: false }),
      ),
    )

    this.resize()
    window.addEventListener('resize', this.resize)
  }

  resize = () => {
    const { width, height, marginTop } = fitViewport(window.innerWidth, window.innerHeight)

    this.canvas.style.width = `${width}px`
    this.canvas.style.height = `${height}px`
    this.canvas.style.marginTop = `${marginTop}px`
    this.renderer.setSize(width, height, false)
  }

  /**
   * Render the world, then any overlay, then blit.
   *
   * The overlay (the weapon in your hands) draws into the SAME render target
   * with the depth buffer cleared first, so it is pixelated identically to the
   * world but cannot be occluded by it. Rendering it after the blit instead
   * would leave it at full screen resolution -- a crisp weapon in front of a
   * 320x200 world, which looks exactly as wrong as it sounds.
   */
  render(overlay?: { scene: THREE.Scene; camera: THREE.Camera }) {
    this.renderer.setRenderTarget(this.target)
    this.renderer.render(this.scene, this.camera)

    if (overlay) {
      this.renderer.autoClear = false
      this.renderer.clearDepth()
      this.renderer.render(overlay.scene, overlay.camera)
      this.renderer.autoClear = true
    }

    this.renderer.setRenderTarget(null)
    this.renderer.render(this.blitScene, this.blitCamera)
  }

  dispose() {
    window.removeEventListener('resize', this.resize)
    this.target.dispose()
    this.renderer.dispose()
  }
}

/**
 * Largest whole-number multiple of the render target that fits in the window,
 * plus the top margin that centres it. Pure, so the letterboxing is a unit
 * test rather than something you check by dragging a window around.
 *
 * Scale never drops below 1: on a viewport smaller than 320x200 we overflow
 * rather than render a fractional image, because a 0.5x scale resamples every
 * pixel and destroys the effect the whole renderer exists to produce.
 */
export function fitViewport(
  windowWidth: number,
  windowHeight: number,
): { scale: number; width: number; height: number; marginTop: number } {
  const scale = Math.max(1, Math.floor(Math.min(windowWidth / RT_WIDTH, windowHeight / RT_HEIGHT)))
  const width = RT_WIDTH * scale
  const height = RT_HEIGHT * scale
  return { scale, width, height, marginTop: Math.max(0, (windowHeight - height) / 2) }
}
