import * as THREE from 'three'
import { cellAt, isSolid, type Level } from './level.ts'
import { texture } from '../engine/textures.ts'

/**
 * Build the level's meshes.
 *
 * Wall faces are emitted only where a solid cell meets an open one. Drawing
 * all six faces of every solid cube would render the entire interior of every
 * wall block -- invisible geometry, but still transformed, rasterised and
 * depth-tested every frame. On E1M1 that is roughly a 5x saving.
 *
 * One merged BufferGeometry per texture rather than a mesh per cell: 300-odd
 * meshes is 300 draw calls, and this is a game that has to hold 60fps while
 * also running enemies.
 */

interface FaceBatch {
  positions: number[]
  normals: number[]
  uvs: number[]
  indices: number[]
}

const emptyBatch = (): FaceBatch => ({ positions: [], normals: [], uvs: [], indices: [] })

/** Push one quad, given its four corners in winding order. */
function quad(
  batch: FaceBatch,
  corners: [number, number, number][],
  normal: [number, number, number],
  uSpan: number,
  vSpan: number,
) {
  const base = batch.positions.length / 3
  for (const [x, y, z] of corners) batch.positions.push(x, y, z)
  for (let i = 0; i < 4; i++) batch.normals.push(...normal)
  batch.uvs.push(0, 0, uSpan, 0, uSpan, vSpan, 0, vSpan)
  batch.indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
}

export interface LevelMeshes {
  group: THREE.Group
  dispose(): void
}

export function buildLevelMeshes(level: Level): LevelMeshes {
  const s = level.cellSize
  const h = level.wallHeight
  const batches = new Map<string, FaceBatch>()

  const batchFor = (key: string) => {
    let b = batches.get(key)
    if (!b) {
      b = emptyBatch()
      batches.set(key, b)
    }
    return b
  }

  for (let z = 0; z < level.height; z++) {
    for (let x = 0; x < level.width; x++) {
      const cell = cellAt(level, x, z)
      if (!cell) continue

      const solid = isSolid(level, x, z)
      if (solid) {
        if (cell.void) continue
        const key = cell.door ? 'door' : (cell.wall ?? cell.secretWall ?? 'brick')
        const b = batchFor(key)
        const x0 = x * s
        const x1 = (x + 1) * s
        const z0 = z * s
        const z1 = (z + 1) * s

        // A face is only drawn where this solid cell borders an open one.
        if (!isSolid(level, x, z - 1)) {
          quad(
            b,
            [
              [x1, 0, z0],
              [x0, 0, z0],
              [x0, h, z0],
              [x1, h, z0],
            ],
            [0, 0, -1],
            1,
            1,
          )
        }
        if (!isSolid(level, x, z + 1)) {
          quad(
            b,
            [
              [x0, 0, z1],
              [x1, 0, z1],
              [x1, h, z1],
              [x0, h, z1],
            ],
            [0, 0, 1],
            1,
            1,
          )
        }
        if (!isSolid(level, x - 1, z)) {
          quad(
            b,
            [
              [x0, 0, z0],
              [x0, 0, z1],
              [x0, h, z1],
              [x0, h, z0],
            ],
            [-1, 0, 0],
            1,
            1,
          )
        }
        if (!isSolid(level, x + 1, z)) {
          quad(
            b,
            [
              [x1, 0, z1],
              [x1, 0, z0],
              [x1, h, z0],
              [x1, h, z1],
            ],
            [1, 0, 0],
            1,
            1,
          )
        }
      } else {
        // Floor and ceiling for every open cell.
        const floor = batchFor(cell.exit ? 'slime' : level.floorTex)
        quad(
          floor,
          [
            [x * s, 0, (z + 1) * s],
            [(x + 1) * s, 0, (z + 1) * s],
            [(x + 1) * s, 0, z * s],
            [x * s, 0, z * s],
          ],
          [0, 1, 0],
          1,
          1,
        )
        const ceiling = batchFor(level.ceilingTex)
        quad(
          ceiling,
          [
            [x * s, h, z * s],
            [(x + 1) * s, h, z * s],
            [(x + 1) * s, h, (z + 1) * s],
            [x * s, h, (z + 1) * s],
          ],
          [0, -1, 0],
          1,
          1,
        )
      }
    }
  }

  const group = new THREE.Group()
  const disposables: { dispose(): void }[] = []

  for (const [key, batch] of batches) {
    if (batch.indices.length === 0) continue
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(batch.positions, 3))
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(batch.normals, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(batch.uvs, 2))
    geo.setIndex(batch.indices)
    const mat = new THREE.MeshLambertMaterial({ map: texture(key) })
    group.add(new THREE.Mesh(geo, mat))
    disposables.push(geo, mat)
  }

  return {
    group,
    dispose() {
      for (const d of disposables) d.dispose()
    },
  }
}
