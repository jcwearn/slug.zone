import type { EnemyDef } from './types.ts'
import { SLUG_BROWN, SLUG_DARK, SLUG_PALE } from '../data/palette.ts'

/**
 * The first two slugs. The remaining five land in G4.
 *
 * The pair is chosen to force different play: a Grub punishes standing still
 * and a Spitter punishes standing at range, so neither is answered by the same
 * habit.
 */
export const ENEMIES: Record<string, EnemyDef> = {
  grub: {
    id: 'grub',
    name: 'Grub',
    hp: 15,
    speed: 2.4,
    radius: 0.3,
    height: 0.35,
    damage: 6,
    attackRange: 0.85,
    attackCooldown: 0.9,
    attackWindup: 0.25,
    painChance: 0.75,
    painTime: 0.25,
    dyingTime: 0.45,
    // Nearly all-round awareness: a swarmer that can be walked behind is not a
    // swarmer.
    sightCone: 2.4,
    sightRange: 14,
    gibThreshold: 20,
    reactionTime: 0.15,
    color: SLUG_BROWN,
    darkColor: SLUG_DARK,
  },

  spitter: {
    id: 'spitter',
    name: 'Spitter',
    hp: 40,
    speed: 1.5,
    radius: 0.36,
    height: 0.5,
    damage: 11,
    // Attacks from well outside melee, and G4 gives it the backpedal that
    // makes closing the distance the player's problem.
    attackRange: 7.5,
    attackCooldown: 1.9,
    attackWindup: 0.55,
    painChance: 0.4,
    painTime: 0.3,
    dyingTime: 0.6,
    sightCone: 1.2,
    sightRange: 18,
    gibThreshold: 45,
    reactionTime: 0.35,
    color: 0x7a9c3a,
    darkColor: 0x3c4a1c,
  },
}

export const PALE = SLUG_PALE
