import { overlapsDisc } from '../engine/collision.ts'
import { addArmour, heal, type PlayerHealth } from '../player/health.ts'
import { addAmmo, giveWeapon, type Arsenal } from '../weapons/arsenal.ts'
import type { Level } from '../world/level.ts'
import { ITEMS } from './definitions.ts'
import type { ItemDef } from './types.ts'

/**
 * Items lying on the floor, and what happens when you walk over one.
 *
 * Pure: no three.js, no audio, no DOM. Positions are in GRID units like the
 * rest of the collision code, so the touch test can reuse `overlapsDisc`
 * instead of being a second distance calculation that agrees with the first
 * right up until one of them is changed.
 */

export interface Pickup {
  def: ItemDef
  x: number
  z: number
  taken: boolean
}

/**
 * How wide an item's footprint is, in grid units.
 *
 * Generous next to the player's 0.28: an item you have to stand exactly on top
 * of feels broken rather than precise, and there is nothing to be gained from
 * making a medikit hard to walk over.
 */
export const PICKUP_RADIUS = 0.4

export function createPickups(level: Level): Pickup[] {
  return level.entities
    .filter((e) => e.type === 'pickup')
    .map((e) => {
      const def = ITEMS[e.item ?? '']
      if (!def) throw new Error(`unknown pickup item: ${e.item}`)
      return { def, x: e.x, z: e.z, taken: false }
    })
}

/** Put every item back on the floor, for a restart. */
export function resetPickups(pickups: Pickup[]): void {
  for (const pickup of pickups) pickup.taken = false
}

/** Every uncollected item a body of `radius` at (x,z) is standing on. */
export function pickupsTouching(pickups: Pickup[], x: number, z: number, radius: number): Pickup[] {
  return pickups.filter(
    (p) => !p.taken && overlapsDisc(x, z, radius, [{ x: p.x, z: p.z, radius: PICKUP_RADIUS }]),
  )
}

/** Who the item is going to. */
export interface Collector {
  health: PlayerHealth
  arsenal: Arsenal
  keys: Set<string>
}

export interface CollectResult {
  /** False leaves the item on the floor, because it would have done nothing. */
  taken: boolean
  /** HUD message line. Empty when nothing was taken. */
  message: string
}

const refused: CollectResult = { taken: false, message: '' }

/**
 * Apply an item's effect.
 *
 * Doom's rule, and it is the reason `heal`, `addArmour` and `addAmmo` all
 * return what they ACTUALLY took rather than nothing: an item you are too full
 * to benefit from is not consumed. Walking over a medikit at 100% and hearing
 * it vanish is how you arrive at the next fight with nothing left.
 *
 * Keys are the exception -- they are not a quantity, and one you already hold
 * can only happen if something has gone wrong upstream.
 */
export function collect(def: ItemDef, into: Collector): CollectResult {
  const got = `GOT ${def.name}`
  const effect = def.effect

  switch (effect.kind) {
    case 'health':
      return heal(into.health, effect.amount) > 0 ? { taken: true, message: got } : refused

    case 'armour':
      return addArmour(into.health, effect.amount) > 0 ? { taken: true, message: got } : refused

    case 'ammo':
      return addAmmo(into.arsenal, effect.ammo, effect.amount) > 0
        ? { taken: true, message: got }
        : refused

    case 'weapon': {
      // Order matters: `giveWeapon` must run before the early return, or a
      // duplicate weapon picked up with full ammo would be refused AND never
      // owned. Both halves are evaluated, then the results are combined.
      const isNew = giveWeapon(into.arsenal, effect.weapon)
      const rounds = addAmmo(into.arsenal, effect.ammo, effect.amount)
      return isNew || rounds > 0 ? { taken: true, message: got } : refused
    }

    case 'key':
      into.keys.add(effect.key)
      return { taken: true, message: got }
  }
}
