import * as THREE from 'three'
import { mulberry32 } from './math.ts'

/**
 * Procedural textures drawn to a canvas at 64x64.
 *
 * Generated rather than shipped as files for two reasons: there are no art
 * assets to host or license, and the noise is seeded, so a given wall looks
 * the same on every machine and in every session.
 *
 * 64x64 is chosen to match the era, and every texture is NearestFilter with
 * mipmaps off. Mipmaps would average neighbouring texels at distance, which is
 * exactly the smoothing the low-resolution render target exists to avoid --
 * the far end of a corridor would go soft while the near end stayed crunchy.
 */

const SIZE = 64
const cache = new Map<string, THREE.Texture>()

type Painter = (ctx: CanvasRenderingContext2D, rng: () => number) => void

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`

/** Scatter per-pixel noise to break up flat fills. */
function speckle(ctx: CanvasRenderingContext2D, rng: () => number, amount: number, alpha: number) {
  for (let i = 0; i < amount; i++) {
    const v = Math.floor(rng() * 60)
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`
    ctx.fillRect(Math.floor(rng() * SIZE), Math.floor(rng() * SIZE), 1, 1)
  }
}

const PAINTERS: Record<string, Painter> = {
  brick(ctx, rng) {
    ctx.fillStyle = hex(0x3b3128)
    ctx.fillRect(0, 0, SIZE, SIZE)
    const rowH = 8
    for (let row = 0; row < SIZE / rowH; row++) {
      const offset = row % 2 === 0 ? 0 : 8
      for (let bx = -16; bx < SIZE; bx += 16) {
        const shade = 0x5a4a3a + Math.floor(rng() * 0x101010) - 0x080808
        ctx.fillStyle = hex(Math.max(0, shade))
        ctx.fillRect(bx + offset + 1, row * rowH + 1, 14, rowH - 2)
      }
    }
    speckle(ctx, rng, 700, 0.22)
  },

  metal(ctx, rng) {
    ctx.fillStyle = hex(0x4a4a52)
    ctx.fillRect(0, 0, SIZE, SIZE)
    for (let x = 0; x < SIZE; x += 4) {
      ctx.fillStyle = `rgba(255,255,255,${0.03 + rng() * 0.05})`
      ctx.fillRect(x, 0, 1, SIZE)
    }
    // Rivets, which are what make a flat panel read as metal at this size.
    ctx.fillStyle = hex(0x2e2e34)
    for (const [x, y] of [
      [4, 4],
      [SIZE - 6, 4],
      [4, SIZE - 6],
      [SIZE - 6, SIZE - 6],
    ]) {
      ctx.fillRect(x, y, 2, 2)
    }
    // Rust bleeding down from the top edge.
    for (let i = 0; i < 26; i++) {
      const x = Math.floor(rng() * SIZE)
      const h = 4 + Math.floor(rng() * 20)
      ctx.fillStyle = `rgba(120,60,20,${0.1 + rng() * 0.2})`
      ctx.fillRect(x, 0, 1, h)
    }
    speckle(ctx, rng, 400, 0.2)
  },

  damp(ctx, rng) {
    ctx.fillStyle = hex(0x2f2f26)
    ctx.fillRect(0, 0, SIZE, SIZE)
    for (let i = 0; i < 34; i++) {
      const x = Math.floor(rng() * SIZE)
      const y = Math.floor(rng() * SIZE)
      const r = 2 + Math.floor(rng() * 6)
      ctx.fillStyle = `rgba(60,80,40,${0.16 + rng() * 0.22})`
      ctx.fillRect(x, y, r, r)
    }
    speckle(ctx, rng, 900, 0.25)
  },

  concrete(ctx, rng) {
    ctx.fillStyle = hex(0x24242a)
    ctx.fillRect(0, 0, SIZE, SIZE)
    speckle(ctx, rng, 1400, 0.3)
  },

  slime(ctx, rng) {
    ctx.fillStyle = hex(0x243a12)
    ctx.fillRect(0, 0, SIZE, SIZE)
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(84,229,8,${0.06 + rng() * 0.16})`
      const r = 3 + Math.floor(rng() * 9)
      ctx.fillRect(Math.floor(rng() * SIZE), Math.floor(rng() * SIZE), r, r)
    }
    speckle(ctx, rng, 500, 0.2)
  },

  door(ctx, rng) {
    ctx.fillStyle = hex(0x5a4632)
    ctx.fillRect(0, 0, SIZE, SIZE)
    ctx.fillStyle = hex(0x6e563c)
    ctx.fillRect(4, 4, SIZE - 8, SIZE - 8)
    ctx.fillStyle = hex(0x30271c)
    ctx.fillRect(SIZE / 2 - 1, 4, 2, SIZE - 8)
    speckle(ctx, rng, 300, 0.2)
  },
}

/** Deterministic per-key seed, so 'brick' looks the same on every machine. */
const seedFor = (key: string) => {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function texture(key: string): THREE.Texture {
  const cached = cache.get(key)
  if (cached) return cached

  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')

  const painter = PAINTERS[key] ?? PAINTERS.concrete
  painter(ctx, mulberry32(seedFor(key)))

  const tex = new THREE.CanvasTexture(canvas)
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace

  cache.set(key, tex)
  return tex
}

export function disposeTextures() {
  for (const tex of cache.values()) tex.dispose()
  cache.clear()
}
