import type { EnemyDef } from './types.ts'
import { SLUG_BROWN, SLUG_DARK, SLUG_PALE } from '../data/palette.ts'

/**
 * The bestiary.
 *
 * Designed as a set rather than one at a time, because what makes a roster
 * work is that no two of them are answered by the same habit. The Grub
 * punishes standing still and the Spitter punishes standing at range; the
 * three that follow punish killing things at arm's length, being caught in
 * the open, and fighting head-on in a corridor.
 *
 * Five rather than the seven the plan called for. Two more recoloured slugs
 * would have been a longer list rather than a deeper one, and there is only
 * one level to spread them across -- the count is worth revisiting in G6 when
 * there is somewhere to put them.
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
    shape: 'slug',
    armour: null,
    standoff: 0,
    charge: null,
    deathBurst: null,
    projectile: null,
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
    shape: 'slug',
    armour: null,
    // Gives ground when you close, which is what turns "walk at it until it
    // dies" into a fight. Comfortably inside its 7.5 reach, so backing off
    // never takes it out of the range it wants to shoot from.
    standoff: 4.5,
    charge: null,
    deathBurst: null,
    // Slow enough to see coming and step out of. A Spitter that cannot be
    // dodged is just a Grub that hits you from across the room.
    projectile: { speed: 7.5, radius: 0.18 },
  },
  slimebloat: {
    id: 'slimebloat',
    name: 'Slimebloat',
    // Survives one full Grinder blast and dies to the second -- which is the
    // trade it exists to offer: the shotgun kills it fastest and the shotgun
    // is the one weapon that puts you inside its burst.
    hp: 90,
    speed: 1.1,
    radius: 0.46,
    height: 0.55,
    // Low, because the burst is the threat and being nibbled on the way in
    // should not be.
    damage: 5,
    attackRange: 1.0,
    attackCooldown: 1.4,
    attackWindup: 0.35,
    // Barely flinches. A creature you can stunlock never gets close enough to
    // matter, and getting close is the entire point of it.
    painChance: 0.15,
    painTime: 0.2,
    dyingTime: 0.5,
    sightCone: 2.0,
    sightRange: 12,
    gibThreshold: 200,
    reactionTime: 0.3,
    color: 0x9ab84a,
    darkColor: 0x4a5a1e,
    shape: 'bloat',
    armour: null,
    standoff: 0,
    charge: null,
    // Hurts more than a Grub's bite and reaches further than melee, so
    // popping one in a doorway you are standing in is a real mistake.
    deathBurst: { damage: 32, radius: 2.6 },
    projectile: null,
  },

  brute: {
    id: 'brute',
    name: 'Banana Brute',
    hp: 70,
    // Slow to walk, fast to lunge. The gap between the two is the tell.
    speed: 1.6,
    radius: 0.44,
    height: 0.75,
    damage: 22,
    attackRange: 1.6,
    attackCooldown: 1.6,
    // Long, because the whole attack is the telegraph. Shorten this and the
    // lunge becomes unavoidable rather than something you sidestep.
    attackWindup: 0.55,
    painChance: 0.3,
    painTime: 0.22,
    dyingTime: 0.7,
    sightCone: 1.4,
    sightRange: 16,
    gibThreshold: 90,
    reactionTime: 0.25,
    color: 0xd8c34a,
    darkColor: 0x6a5a12,
    shape: 'brute',
    armour: null,
    standoff: 0,
    // Covers most of its own reach during the wind-up, so backing straight up
    // does not save you and stepping aside does.
    charge: 8.5,
    deathBurst: null,
    projectile: null,
  },

  shellback: {
    id: 'shellback',
    name: 'Shellback',
    hp: 55,
    speed: 1.2,
    radius: 0.42,
    height: 0.5,
    damage: 14,
    attackRange: 1.2,
    attackCooldown: 1.5,
    attackWindup: 0.4,
    painChance: 0.5,
    painTime: 0.25,
    dyingTime: 0.6,
    // Narrow: the plating faces where it is looking, so its blind spot and its
    // soft spot are the same place and getting behind it does two jobs.
    sightCone: 0.9,
    sightRange: 14,
    gibThreshold: 60,
    reactionTime: 0.4,
    color: 0xb0703a,
    darkColor: 0x50301a,
    shape: 'shell',
    // A wide arc and a hard multiplier together. A narrow arc makes strafing a
    // few degrees the answer, and a soft multiplier makes shooting the shell
    // merely slow rather than wrong.
    armour: { arc: 1.5, multiplier: 0.12 },
    standoff: 0,
    charge: null,
    deathBurst: null,
    projectile: null,
  },
}

export const PALE = SLUG_PALE
