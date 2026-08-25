import { beforeAll, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { parseLevel } from '../world/level.ts'
import type { LevelSource } from '../world/types.ts'

/**
 * The automap across a level change.
 *
 * `Minimap` needs a 2D canvas, which does not exist outside a browser, so the
 * drawing surface here is a stub that records nothing. What is under test is
 * not what gets painted -- rendering is not tested in this repo -- but the
 * bookkeeping around the texture, which is where a real bug lived:
 *
 * three.js allocates a texture's GPU storage ONCE, with `texStorage2D`, and
 * that allocation is immutable. Every later upload is a `texSubImage2D` into
 * it. A texture first uploaded at E1M1's 60x51 canvas therefore could never
 * show E1M5's 64x40 -- the upload is wider than the allocation, the call
 * fails, and the map freezes on whatever it last held. E1M2, E1M3 and E1M4 all
 * happen to fit inside 60x51, so the nest was the only level it was visible
 * on, and every automap test passed for all five.
 */

const ctx2d = {
  clearRect: () => {},
  fillRect: () => {},
  beginPath: () => {},
  moveTo: () => {},
  lineTo: () => {},
  closePath: () => {},
  fill: () => {},
  fillStyle: '',
}

beforeAll(() => {
  vi.stubGlobal('document', {
    createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }),
  })
})

const source = (width: number, height: number): LevelSource => ({
  id: `w${width}h${height}`,
  name: 'Fixture',
  music: 'none',
  cellSize: 4,
  wallHeight: 4,
  floorTex: 'damp',
  ceilingTex: 'concrete',
  fog: 0.05,
  legend: { '#': { wall: 'brick' }, '.': { floor: true } },
  grid: Array.from({ length: height }, (_, z) =>
    z === 0 || z === height - 1 ? '#'.repeat(width) : '#' + '.'.repeat(width - 2) + '#',
  ),
  entities: [{ type: 'player', x: 1.5, z: 1.5 }],
  par: 60_000,
})

describe('Minimap.resize', () => {
  it('replaces the texture rather than resizing the one it has', async () => {
    const { Minimap } = await import('./minimap.ts')
    const map = new Minimap(parseLevel(source(20, 17)))
    const material = map.mesh.material as THREE.MeshBasicMaterial
    const before = material.map

    map.resize(parseLevel(source(32, 20)))

    expect(material.map, 'the material is still pointing at the old texture').not.toBe(before)
    expect(material.map).toBe((map as unknown as { texture: THREE.Texture }).texture)
  })

  it('disposes the texture it replaced', async () => {
    const { Minimap } = await import('./minimap.ts')
    const map = new Minimap(parseLevel(source(20, 17)))
    const before = (map.mesh.material as THREE.MeshBasicMaterial).map!
    const disposed = vi.fn()
    before.addEventListener('dispose', disposed)

    map.resize(parseLevel(source(32, 20)))
    expect(disposed, 'a texture per level transition, leaked').toHaveBeenCalled()
  })

  it('re-fits the quad to the new level', async () => {
    // A bigger level must not keep the previous level's quad, or the map is
    // drawn into a box the wrong shape and squashed to fit.
    const { Minimap } = await import('./minimap.ts')
    const map = new Minimap(parseLevel(source(20, 17)))
    const tall = map.mesh.scale.y

    map.resize(parseLevel(source(32, 20)))
    expect(map.mesh.scale.y).not.toBe(tall)
  })
})
