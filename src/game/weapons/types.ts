/** Ammo pools. Weapons share pools, so picking up a Grinder is not free. */
export type AmmoKind = 'fine' | 'coarse' | 'brine' | 'licks'

export interface WeaponDef {
  id: string
  name: string
  /** Slot the number keys select. */
  slot: number
  ammo: AmmoKind | null
  /** Rounds removed from the pool per shot. */
  ammoPerShot: number
  /** Seconds between shots. */
  cooldown: number
  /** Projectiles emitted per shot. >1 is a spread. */
  pellets: number
  /** Max half-angle of the spread cone, radians. 0 is perfectly accurate. */
  spread: number
  damage: number
  /** Grid units. Beyond this a hitscan shot does nothing. */
  range: number
  /** Damage falls off linearly from 1.0 at point blank to this at max range. */
  falloff: number
  /** Held fire keeps shooting. */
  automatic: boolean
  /** Seconds to raise the weapon when switched to. */
  raiseTime: number
}
