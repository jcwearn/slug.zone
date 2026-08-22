import * as THREE from 'three'
import { texture } from '../engine/textures.ts'
import { KEY_COLOURS } from '../data/palette.ts'
import type { Door } from './doors.ts'
import type { Level } from './level.ts'

/**
 * The moving half of a door: one box per leaf, lifted out of the doorway.
 *
 * Separate meshes rather than faces in `geometry.ts`'s merged batches, because
 * a merged face cannot move. There are three leaves on E1M1 -- 36 triangles --
 * so nothing here is worth culling or instancing.
 *
 * Leaves rise into the ceiling, Doom-style, rather than sliding sideways. A
 * push-wall needs somewhere to go, and E1M1's secret has open floor on BOTH
 * sides: it would slide into a walkable cell and stand there as an
 * unexplained block, in a cell whose own neighbours were never given faces.
 */

/**
 * Extra travel past the ceiling.
 *
 * At exactly `wallHeight` the leaf's underside is coplanar with the ceiling
 * quads and z-fights with them, which flickers in the one spot the player is
 * looking at while walking through.
 */
const CLEARANCE = 0.06

export class DoorViews {
  readonly group = new THREE.Group()
  private readonly meshes: THREE.Mesh[] = []
  private readonly geometry: THREE.BoxGeometry
  private readonly materials = new Map<string, THREE.Material>()

  constructor(doors: Door[], level: Level) {
    const s = level.cellSize
    // Y is the room's height directly, NOT scaled by cellSize -- the leaf has
    // to exactly fill a doorway that geometry.ts built from 0 to wallHeight.
    this.geometry = new THREE.BoxGeometry(s, level.wallHeight, s)

    for (const door of doors) {
      const mesh = new THREE.Mesh(this.geometry, this.materialFor(door))
      mesh.position.set((door.x + 0.5) * s, level.wallHeight / 2, (door.z + 0.5) * s)
      this.group.add(mesh)
      this.meshes.push(mesh)
    }
  }

  private materialFor(door: Door): THREE.Material {
    // Keyed doors are the door texture tinted with the card's own colour, so
    // the thing blocking you and the pip on the status bar are the same red.
    // A separate painter per colour would be three more textures to keep in
    // step for no visual gain.
    const tint = door.key ? KEY_COLOURS[door.key as keyof typeof KEY_COLOURS] : undefined
    const cacheKey = `${door.texture}:${tint ?? 'plain'}`

    let material = this.materials.get(cacheKey)
    if (!material) {
      material = new THREE.MeshLambertMaterial({
        map: texture(door.texture),
        color: tint ?? 0xffffff,
      })
      this.materials.set(cacheKey, material)
    }
    return material
  }

  /** Lift every leaf to match its openness. */
  sync(doors: Door[], level: Level): void {
    const h = level.wallHeight
    for (let i = 0; i < doors.length; i++) {
      this.meshes[i].position.y = h / 2 + doors[i].openness * (h + CLEARANCE)
    }
  }

  dispose(): void {
    this.geometry.dispose()
    for (const material of this.materials.values()) material.dispose()
    this.materials.clear()
  }
}
