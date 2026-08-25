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
    // Three Salt Shaker shots rather than two. At 15 it died in 0.28s while
    // needing 0.40s to notice you and bite -- so it could not land a hit even
    // in principle, and no amount of pain tuning reaches that. It is still the
    // flimsiest thing in the roster; the swarm is the threat, not the Grub.
    hp: 28,
    speed: 2.4,
    radius: 0.3,
    height: 0.35,
    damage: 6,
    attackRange: 0.85,
    attackCooldown: 0.9,
    // Quick off the mark rather than tough. The Grub should stay a three-shot
    // pushover -- what was wrong was that it took LONGER to bite than to die,
    // and the fix for a swarmer is to make it faster, not to give it a health
    // pool it has no business having.
    attackWindup: 0.2,
    painChance: 0.75,
    painTime: 0.25,
    // Flinches at almost anything, so without a commit point it never bites at
    // all -- it is the roster's most staggerable creature and its wind-up is
    // the shortest. A late one: the swarm is meant to punish standing still,
    // not to be unstoppable once it has started.
    commitAt: 0.3,
    dyingTime: 0.45,
    // Nearly all-round awareness: a swarmer that can be walked behind is not a
    // swarmer.
    sightCone: 2.4,
    sightRange: 14,
    gibThreshold: 38,
    reactionTime: 0.1,
    color: SLUG_BROWN,
    darkColor: SLUG_DARK,
    shape: 'slug',
    armour: null,
    standoff: 0,
    charge: null,
    enrage: null,
    deathBurst: null,
    projectile: null,
  },

  spitter: {
    id: 'spitter',
    name: 'Spitter',
    // Same problem as the Grub and worse: a 0.55s wind-up on top of a 0.35s
    // reaction meant 0.90s to its first glob against a 0.78s life expectancy.
    // Five shots at its preferred range, where falloff has taken 12 down to 11.
    hp: 55,
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
    // Committing matters more for the one that fights at range: it is being
    // shot at for the whole of its long wind-up, which is exactly the
    // situation the stagger loop was eating.
    commitAt: 0.35,
    dyingTime: 0.6,
    sightCone: 1.2,
    sightRange: 18,
    gibThreshold: 62,
    reactionTime: 0.3,
    color: 0x7a9c3a,
    darkColor: 0x3c4a1c,
    shape: 'slug',
    armour: null,
    // Gives ground when you close, which is what turns "walk at it until it
    // dies" into a fight. Comfortably inside its 7.5 reach, so backing off
    // never takes it out of the range it wants to shoot from.
    standoff: 4.5,
    charge: null,
    enrage: null,
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
    commitAt: 0.4,
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
    enrage: null,
    deathBurst: { damage: 32, radius: 2.6 },
    projectile: null,
  },

  brute: {
    id: 'brute',
    name: 'Banana Brute',
    // Seven shots. Also takes it back out of one-shot range for a point-blank
    // Grinder volley, which at 72 killed it outright before it could swing.
    hp: 80,
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
    // The earliest commit in the roster, because the lunge IS the creature.
    // There is still a window at the top of the wind-up where a shot stops it,
    // so reading the tell and reacting is rewarded -- what is gone is stopping
    // it by holding the trigger down and never looking at it.
    commitAt: 0.3,
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
    // Enough to close on a player who backs straight up at a sprint, and not a
    // great deal more. At 8.5 it covered 4.7 cells to a sprinter's 2.5 during
    // the same 0.55s, which is not a lunge you dodge -- it is one you wear.
    //
    // Stepping aside is the answer, and it only became an answer once the
    // lunge stopped homing: `enemy.ts` latches the direction when the wind-up
    // begins, so this travels the line you were standing on.
    charge: 4.5,
    enrage: null,
    deathBurst: null,
    projectile: null,
  },

  shellback: {
    id: 'shellback',
    name: 'Shellback',
    // Measured from BEHIND, which is the only side these numbers describe --
    // the front is a different weapon entirely.
    hp: 65,
    speed: 1.2,
    radius: 0.42,
    height: 0.5,
    damage: 14,
    attackRange: 1.2,
    attackCooldown: 1.5,
    attackWindup: 0.4,
    painChance: 0.5,
    painTime: 0.25,
    commitAt: 0.35,
    dyingTime: 0.6,
    // Narrow: the plating faces where it is looking, so its blind spot and its
    // soft spot are the same place and getting behind it does two jobs.
    sightCone: 0.9,
    sightRange: 14,
    gibThreshold: 70,
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
    enrage: null,
    deathBurst: null,
    projectile: null,
  },
  /**
   * The Matriarch. The thing the rest of them came out of.
   *
   * Two creatures wearing one body. While the plating holds she will not let
   * you close: she gives ground to keep you at glob range and the front of her
   * is nine tenths proof, so the fight is a long one fought at distance with
   * the Salt Shaker, from behind the pillars, working round to a flank.
   *
   * Under two fifths of her health the shell splits, and everything that made
   * that fight work stops being true. She stops giving ground, stops throwing,
   * stops flinching, and comes at you at nearly twice the speed with a lunge
   * that hits harder than anything else in the game. The answer that got you
   * there is the wrong answer for what is left, which is the whole point of
   * her -- and the reason it is a phase rather than a second creature is that
   * the health bar you have been chipping at is the timer.
   */
  matriarch: {
    id: 'matriarch',
    name: 'The Matriarch',
    // Sized against the clock rather than by feel. Seven hundred behind a
    // tenth-damage front took a circling player eighty-nine seconds, which is
    // not an encounter, it is an errand.
    hp: 520,
    speed: 0.9,
    radius: 0.7,
    // Nearly the full height of the room. The silhouette is most of what a
    // boss is at this resolution.
    height: 0.92,
    damage: 15,
    attackRange: 9,
    attackCooldown: 2.2,
    attackWindup: 0.7,
    // She flinches, but not much, and not at all once the shell is off.
    painChance: 0.2,
    painTime: 0.25,
    commitAt: 0.3,
    dyingTime: 1.4,
    sightCone: 1.6,
    sightRange: 24,
    // Unreachable on purpose: nothing in the arsenal comes near it, and a boss
    // that can be blown to pieces by a lucky volley has no ending.
    gibThreshold: 900,
    reactionTime: 0.5,
    color: 0xc46a9a,
    darkColor: 0x5a2440,
    shape: 'matriarch',
    // Softer than the Shellback's tenth, because there is sixty times as much
    // of her to get through: at a tenth the front is not a reason to move
    // round, it is a reason to stop shooting.
    armour: { arc: 1.3, multiplier: 0.22 },
    // Backs off to keep you at throwing distance, comfortably inside her reach.
    standoff: 6,
    charge: null,
    deathBurst: { damage: 55, radius: 4.5 },
    projectile: { speed: 8.5, radius: 0.3 },
    enrage: {
      below: 0.4,
      def: {
        armour: null,
        standoff: 0,
        projectile: null,
        charge: 5.2,
        speed: 1.7,
        attackRange: 2.4,
        attackCooldown: 1.5,
        attackWindup: 0.5,
        damage: 30,
        painChance: 0.05,
        reactionTime: 0.2,
      },
    },
  },
}

export const PALE = SLUG_PALE
