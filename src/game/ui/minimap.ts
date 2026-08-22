import * as THREE from 'three'
import { KEY_COLOURS } from '../data/palette.ts'
import { isExplored, type Explored } from '../world/explored.ts'
import type { Level } from '../world/level.ts'

/**
 * The automap in the corner, drawn only where the player has been.
 *
 * Deliberately not a radar. Enemies and items are never plotted: knowing the
 * shape of a room you have walked through is a memory aid, but knowing what is
 * standing in the next one is a different game.
 *
 * Secret walls are drawn as the wall they are pretending to be, for the same
 * reason the use prompt says nothing about them.
 */

const SCREEN_WIDTH = 320
const SCREEN_HEIGHT = 200
/** Largest the map may grow in either axis, in screen pixels. */
const MAX_SPAN = 66
const MARGIN = 4
/** Clear of the message line along the top. */
const TOP = 15

const UNSEEN = 'rgba(0, 0, 0, 0)'
const WALL = '#2c7a06'
const FLOOR = '#0e2405'
const EXIT = '#54e508'
const DOOR = '#a8783c'
const PLAYER = '#e8e4d8'

export class Minimap {
  readonly mesh: THREE.Mesh
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly texture: THREE.CanvasTexture
  private readonly scale: number
  private signature = ''

  constructor(level: Level) {
    // Whole pixels per cell, or the grid shimmers as it scales. Two is the
    // floor: at one pixel a wall and the corridor beside it are the same line.
    this.scale = Math.max(
      2,
      Math.min(5, Math.floor(MAX_SPAN / Math.max(level.width, level.height))),
    )

    const width = level.width * this.scale
    const height = level.height * this.scale

    this.canvas = document.createElement('canvas')
    this.canvas.width = width
    this.canvas.height = height
    const ctx = this.canvas.getContext('2d')
    if (!ctx) throw new Error('2d context unavailable')
    this.ctx = ctx

    this.texture = new THREE.CanvasTexture(this.canvas)
    this.texture.magFilter = THREE.NearestFilter
    this.texture.minFilter = THREE.NearestFilter
    this.texture.generateMipmaps = false
    this.texture.colorSpace = THREE.SRGBColorSpace

    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthTest: false }),
    )
    // Top right, in the ortho 0..1 screen space the layer uses.
    const w = width / SCREEN_WIDTH
    const h = height / SCREEN_HEIGHT
    this.mesh.scale.set(w, h, 1)
    this.mesh.position.set(1 - MARGIN / SCREEN_WIDTH - w / 2, 1 - TOP / SCREEN_HEIGHT - h / 2, 0)
  }

  /**
   * Repaint if anything visible has changed.
   *
   * The signature carries the player's position in MAP pixels rather than in
   * grid cells: at this scale a cell is a few pixels across, and keying off the
   * cell would make the arrow jump a whole room's width at a time while the
   * player walked smoothly.
   */
  update(level: Level, explored: Explored, x: number, z: number, yaw: number, charted: number) {
    const signature = [
      charted,
      Math.round(x * this.scale),
      Math.round(z * this.scale),
      // Sixteen headings is finer than the arrow can actually draw.
      Math.round((yaw / (Math.PI * 2)) * 16),
    ].join('|')
    if (signature === this.signature) return
    this.signature = signature
    this.draw(level, explored, x, z, yaw)
  }

  /** Forget what was painted, so a restart repaints an empty map. */
  invalidate(): void {
    this.signature = ''
  }

  private draw(level: Level, explored: Explored, x: number, z: number, yaw: number): void {
    const ctx = this.ctx
    const s = this.scale
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

    for (const cell of level.cells) {
      if (cell.void) continue
      if (!isExplored(explored, cell.x, cell.z)) continue

      let colour = UNSEEN
      if (cell.exit) colour = EXIT
      else if (cell.door) {
        // Keyed doors wear their card's colour, the same tint the leaf itself
        // is drawn in -- so a red block on the map is the red door.
        colour = cell.door.key ? colourOf(cell.door.key) : DOOR
      } else if (cell.wall ?? cell.secretWall) colour = WALL
      else colour = FLOOR

      ctx.fillStyle = colour
      ctx.fillRect(cell.x * s, cell.z * s, s, s)
    }

    this.drawPlayer(x * s, z * s, yaw)
    this.texture.needsUpdate = true
  }

  /**
   * A small arrow at the player, pointing where they are looking.
   *
   * Forward is (-sin yaw, -cos yaw) -- the one convention in this codebase
   * that must never be re-derived. On the map, +z is down, which is what the
   * world grid already means, so no axis is flipped here.
   */
  private drawPlayer(px: number, pz: number, yaw: number): void {
    const ctx = this.ctx
    const fx = -Math.sin(yaw)
    const fz = -Math.cos(yaw)
    const nose = Math.max(3, this.scale * 1.4)
    const tail = nose * 0.55

    ctx.fillStyle = PLAYER
    ctx.beginPath()
    ctx.moveTo(px + fx * nose, pz + fz * nose)
    // The two back corners, taken as the forward vector turned a right angle
    // each way, so the arrow stays a triangle at every heading.
    ctx.lineTo(px - fx * tail - fz * tail, pz - fz * tail + fx * tail)
    ctx.lineTo(px - fx * tail + fz * tail, pz - fz * tail - fx * tail)
    ctx.closePath()
    ctx.fill()
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    const material = this.mesh.material as THREE.Material
    material.dispose()
    this.texture.dispose()
  }
}

function colourOf(key: string): string {
  const value = KEY_COLOURS[key as keyof typeof KEY_COLOURS]
  return value === undefined ? DOOR : `#${value.toString(16).padStart(6, '0')}`
}
