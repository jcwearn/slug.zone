import * as THREE from 'three'
import { cellAt, type Level } from './level.ts'
import { texture } from '../engine/textures.ts'

/**
 * Build the level's meshes.
 *
 * Wall faces are emitted only where a wall meets something you can see
 * through. Drawing all six faces of every solid cube would render the entire
 * interior of every wall block -- invisible geometry, but still transformed,
 * rasterised and depth-tested every frame. On E1M1 that is roughly a 5x saving.
 *
 * One merged BufferGeometry per texture rather than a mesh per cell: 300-odd
 * meshes is 300 draw calls, and this is a game that has to hold 60fps while
 * also running enemies.
 *
 * This builds the STATIC world only. Door and secret leaves move, so they are
 * separate meshes in `doorview.ts`; what is emitted here for those cells is
 * the floor and ceiling the leaf uncovers.
 */

export interface FaceBatch {
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

/**
 * Whether a neighbouring cell hides the face between them.
 *
 * Deliberately NOT `isSolid`. A door is solid to collision but is a PORTAL to
 * geometry: its leaf is a separate mesh that rises out of the way, so the
 * walls around it need real faces or opening it reveals the hollow inside of
 * the jamb and a view straight through the wall. Same for a secret.
 *
 * Using `isSolid` here would also tie the static mesh to runtime door state,
 * so a level rebuilt with a door already open would bake the hole in.
 */
function opaque(level: Level, x: number, z: number): boolean {
  const cell = cellAt(level, x, z)
  if (!cell) return true
  return Boolean(cell.wall ?? cell.void)
}

/**
 * Vertex data only -- no meshes, no materials, no textures.
 *
 * Split out so the geometry can be asserted in a plain node test. Textures are
 * drawn to a canvas, so anything touching them needs a DOM, and needing a DOM
 * to check that a wall is four units tall is the wrong trade.
 */
export function buildLevelBuffers(level: Level): Map<string, FaceBatch> {
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
      if (cell.void) continue

      // Doors and secrets take the open-cell branch: they need a floor under
      // them and a ceiling over them, or the moment the leaf rises you are
      // looking into the void through the gap where the cell used to be. The
      // leaf itself is built by `doorview.ts` as its own mesh, because a face
      // merged into one of these batches cannot move.
      if (cell.wall) {
        const b = batchFor(cell.wall)
        const x0 = x * s
        const x1 = (x + 1) * s
        const z0 = z * s
        const z1 = (z + 1) * s

        // A face is only drawn where this wall borders something see-through.
        if (!opaque(level, x, z - 1)) {
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
        if (!opaque(level, x, z + 1)) {
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
        if (!opaque(level, x - 1, z)) {
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
        if (!opaque(level, x + 1, z)) {
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
        // Floor and ceiling for every cell you could ever stand in --
        // floor, exit, and the door and secret cells whose leaves lift away.
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

  return batches
}

export function buildLevelMeshes(level: Level): LevelMeshes {
  const batches = buildLevelBuffers(level)
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
