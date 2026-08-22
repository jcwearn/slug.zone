import { isSolid, type Level } from '../world/level.ts'

/**
 * Acid globs, thrown by ranged enemies.
 *
 * The Spitter previously dealt its damage the instant its wind-up finished, so
 * from the player's side a slug twitched and health vanished with nothing in
 * between. A telegraph you cannot see is not a telegraph.
 *
 * Making the attack a travelling object also makes it DODGEABLE, which is the
 * point of a ranged enemy at all: it is aimed where you were when it fired, so
 * moving after the wind-up is what saves you.
 *
 * COORDINATES: x and z are GRID units, matching enemies and the player. `worldY`
 * is WORLD units, matching the room height, because that is what geometry.ts
 * builds against. The two do not share a scale and mixing them has already cost
 * this project one invisible-tracer bug, so the field name says which is which.
 */

export interface Glob {
  active: boolean
  x: number
  z: number
  worldY: number
  vx: number
  vz: number
  vWorldY: number
  damage: number
  /** Grid units. */
  radius: number
  /** Seconds before it fizzles out on its own. */
  life: number
  age: number
}

export type GlobOutcome =
  | { kind: 'none' }
  | { kind: 'wall'; x: number; z: number; worldY: number }
  | { kind: 'hit'; damage: number; x: number; z: number; worldY: number }
  | { kind: 'expired'; x: number; z: number; worldY: number }

const MAX_GLOBS = 48

export class Globs {
  readonly items: Glob[] = []
  private next = 0

  constructor() {
    for (let i = 0; i < MAX_GLOBS; i++) {
      this.items.push({
        active: false,
        x: 0,
        z: 0,
        worldY: 0,
        vx: 0,
        vz: 0,
        vWorldY: 0,
        damage: 0,
        radius: 0.16,
        life: 0,
        age: 0,
      })
    }
  }

  get activeCount(): number {
    return this.items.reduce((n, g) => n + (g.active ? 1 : 0), 0)
  }

  /**
   * Launch one from `from` toward `to`, arcing slightly.
   *
   * Deliberately no target leading. Firing at where the player IS means walking
   * sideways after the wind-up dodges it, which is the whole reason to make the
   * attack visible; leading the shot would make moving pointless.
   */
  spawn(
    fromX: number,
    fromZ: number,
    fromWorldY: number,
    toX: number,
    toZ: number,
    toWorldY: number,
    speed: number,
    damage: number,
  ): Glob | null {
    const dx = toX - fromX
    const dz = toZ - fromZ
    const flat = Math.hypot(dx, dz)
    if (flat < 1e-6) return null

    const glob = this.items[this.next]
    this.next = (this.next + 1) % MAX_GLOBS

    const travel = flat / speed
    glob.active = true
    glob.x = fromX
    glob.z = fromZ
    glob.worldY = fromWorldY
    glob.vx = (dx / flat) * speed
    glob.vz = (dz / flat) * speed
    // Chosen so it arrives at the target's height rather than dropping short,
    // which is what a flat velocity would do once gravity is applied.
    glob.vWorldY = (toWorldY - fromWorldY) / travel + 0.5 * GRAVITY * travel
    glob.damage = damage
    glob.life = Math.max(1.5, travel * 2.5)
    glob.age = 0
    return glob
  }

  /** Advance every glob and report what each one did. */
  step(
    level: Level,
    dt: number,
    playerX: number,
    playerZ: number,
    playerRadius: number,
    roomHeight: number,
    /** The player's vertical extent, world units. */
    playerBottom = 0,
    playerTop = roomHeight,
  ): GlobOutcome[] {
    const outcomes: GlobOutcome[] = []

    for (const glob of this.items) {
      if (!glob.active) continue

      glob.age += dt
      glob.vWorldY -= GRAVITY * dt
      glob.x += glob.vx * dt
      glob.z += glob.vz * dt
      glob.worldY += glob.vWorldY * dt

      if (glob.age >= glob.life) {
        glob.active = false
        outcomes.push({ kind: 'expired', x: glob.x, z: glob.z, worldY: glob.worldY })
        continue
      }

      // The player is checked BEFORE geometry. Standing with your back against
      // a wall would otherwise let the glob resolve into the wall on the same
      // tick it reaches you, and the shot that hit you would splash harmlessly.
      const dx = glob.x - playerX
      const dz = glob.z - playerZ
      const reach = glob.radius + playerRadius
      // Height matters. A purely 2D test means a glob sailing over your head
      // still hits you, and -- worse -- makes the launch arc irrelevant, since
      // a shot that drops at your feet counts the same as one at your chest.
      const withinHeight = glob.worldY >= playerBottom && glob.worldY <= playerTop
      if (withinHeight && dx * dx + dz * dz < reach * reach) {
        glob.active = false
        outcomes.push({
          kind: 'hit',
          damage: glob.damage,
          x: glob.x,
          z: glob.z,
          worldY: glob.worldY,
        })
        continue
      }

      if (
        isSolid(level, Math.floor(glob.x), Math.floor(glob.z)) ||
        glob.worldY <= 0 ||
        glob.worldY >= roomHeight
      ) {
        glob.active = false
        outcomes.push({ kind: 'wall', x: glob.x, z: glob.z, worldY: glob.worldY })
        continue
      }
    }

    return outcomes
  }

  clear(): void {
    for (const glob of this.items) glob.active = false
  }
}

/** World units per second squared. Enough arc to read, not enough to lob over walls. */
export const GRAVITY = 5
