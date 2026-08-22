import type { WeaponDef } from './types.ts'

/**
 * The salt arsenal. Only the first two are implemented; the rest land in G6.
 *
 * Numbers are tuned against the 60Hz fixed step, so a cooldown is always a
 * whole number of ticks give or take a millisecond -- a cooldown that lands
 * mid-tick makes the effective fire rate wobble between two values.
 */
export const WEAPONS: Record<string, WeaponDef> = {
  saltshaker: {
    id: 'saltshaker',
    name: 'Salt Shaker',
    slot: 1,
    // The one weapon with no ammo pool. A player who burns everything else
    // still has a way to kill a Grub, so a level is never unwinnable.
    ammo: null,
    ammoPerShot: 0,
    cooldown: 0.25,
    pellets: 1,
    spread: 0.012,
    damage: 12,
    range: 40,
    falloff: 0.55,
    automatic: false,
    raiseTime: 0.25,
  },

  grinder: {
    id: 'grinder',
    name: 'The Grinder',
    slot: 2,
    ammo: 'coarse',
    ammoPerShot: 1,
    cooldown: 0.8,
    pellets: 8,
    spread: 0.14,
    // Per pellet. All eight landing is 72, which two-shots a Slimebloat and
    // is meant to feel worth the ammo at knife range.
    damage: 9,
    range: 18,
    falloff: 0.3,
    automatic: false,
    raiseTime: 0.4,
  },
}

export const BY_SLOT = new Map<number, string>(Object.values(WEAPONS).map((w) => [w.slot, w.id]))
