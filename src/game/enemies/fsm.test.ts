import { beforeEach, describe, expect, it } from 'vitest'
import { armourScale } from './enemy.ts'
import {
  activeDef,
  canSee,
  createMind,
  damage,
  isAlive,
  step,
  type EnemyMind,
  type Perception,
} from './fsm.ts'
import { ENEMIES } from './definitions.ts'
import type { EnemyDef } from './types.ts'
import { mulberry32 } from '../engine/math.ts'

const grub = ENEMIES.grub
const STEP = 1 / 60

const seeing = (distance: number): Perception => ({
  distance,
  hasLineOfSight: true,
  angleToPlayer: 0,
})
const blind: Perception = { distance: 3, hasLineOfSight: false, angleToPlayer: 0 }

/** Run the machine forward in real fixed steps. */
const advance = (mind: EnemyMind, p: Perception, seconds: number) => {
  const strikes: number[] = []
  let t = 0
  for (; t < seconds; t += STEP) {
    step(mind, grub, p, STEP)
    if (mind.didStrike) strikes.push(t)
  }
  return strikes
}

const never = () => 1 // pain roll never succeeds
const always = () => 0 // pain roll always succeeds

let mind: EnemyMind
beforeEach(() => {
  mind = createMind(grub)
})

describe('canSee', () => {
  it('needs line of sight, range and the cone together', () => {
    expect(canSee(grub, seeing(5))).toBe(true)
    expect(canSee(grub, { ...seeing(5), hasLineOfSight: false })).toBe(false)
    expect(canSee(grub, seeing(grub.sightRange + 1))).toBe(false)
    expect(canSee(grub, { ...seeing(5), angleToPlayer: grub.sightCone + 0.1 })).toBe(false)
  })
})

describe('idle', () => {
  it('starts idle and does nothing without a player', () => {
    expect(mind.state).toBe('idle')
    const intent = step(mind, grub, blind, STEP)
    expect(intent).toEqual({ velocity: 0, turn: false })
  })

  it('does not turn to track a player it has not noticed', () => {
    // Turning while idle reads as the enemy cheating.
    expect(step(mind, grub, blind, STEP).turn).toBe(false)
  })

  it('goes alert on sight', () => {
    step(mind, grub, seeing(6), STEP)
    expect(mind.state).toBe('alert')
  })
})

describe('alert', () => {
  it('waits out the reaction time before chasing', () => {
    step(mind, grub, seeing(6), STEP)
    expect(mind.state).toBe('alert')
    advance(mind, seeing(6), grub.reactionTime + STEP)
    expect(mind.state).toBe('chase')
  })

  it('turns during the reaction beat so the wind-up is visible', () => {
    step(mind, grub, seeing(6), STEP)
    expect(step(mind, grub, seeing(6), STEP)).toMatchObject({ velocity: 0, turn: true })
  })
})

describe('chase', () => {
  beforeEach(() => {
    advance(mind, seeing(6), grub.reactionTime + 2 * STEP)
  })

  it('moves toward a visible player', () => {
    expect(step(mind, grub, seeing(6), STEP)).toMatchObject({ velocity: grub.speed, turn: true })
  })

  it('keeps coming after losing sight, so cover is not an off switch', () => {
    expect(step(mind, grub, blind, STEP).velocity).toBe(grub.speed)
    expect(mind.state).toBe('chase')
  })

  it('attacks once inside range', () => {
    step(mind, grub, seeing(grub.attackRange - 0.1), STEP)
    expect(mind.state).toBe('attack')
  })

  it('holds position in range while reloading rather than shuffling closer', () => {
    advance(mind, seeing(0.5), grub.attackWindup + 2 * STEP)
    expect(mind.attackCooldown).toBeGreaterThan(0)
    expect(step(mind, grub, seeing(0.5), STEP).velocity).toBe(0)
  })
})

describe('attack', () => {
  beforeEach(() => {
    advance(mind, seeing(6), grub.reactionTime + 2 * STEP)
  })

  it('lands the strike at the END of the windup', () => {
    const strikes = advance(mind, seeing(0.5), grub.attackWindup + 2 * STEP)
    expect(strikes).toHaveLength(1)
    expect(strikes[0]).toBeGreaterThanOrEqual(grub.attackWindup - STEP)
  })

  it('misses if the player leaves range during the windup', () => {
    // The telegraph has to mean something, or there is no reason to move.
    step(mind, grub, seeing(0.5), STEP)
    expect(mind.state).toBe('attack')
    const strikes = advance(mind, seeing(9), grub.attackWindup + 2 * STEP)
    expect(strikes).toHaveLength(0)
  })

  it('misses if line of sight breaks during the windup', () => {
    step(mind, grub, seeing(0.5), STEP)
    const strikes = advance(mind, { ...blind, distance: 0.5 }, grub.attackWindup + 2 * STEP)
    expect(strikes).toHaveLength(0)
  })

  it('respects the cooldown between strikes', () => {
    const window = 3
    const strikes = advance(mind, seeing(0.5), window)
    const expected = Math.floor(window / (grub.attackCooldown + grub.attackWindup)) + 1
    expect(strikes.length).toBeLessThanOrEqual(expected)
    expect(strikes.length).toBeGreaterThan(0)
    for (let i = 1; i < strikes.length; i++) {
      expect(strikes[i] - strikes[i - 1]).toBeGreaterThanOrEqual(grub.attackCooldown - 2 * STEP)
    }
  })
})

describe('damage and death', () => {
  it('subtracts hp and provokes', () => {
    damage(mind, grub, 5, never)
    expect(mind.hp).toBe(grub.hp - 5)
    expect(mind.provoked).toBe(true)
  })

  it('staggers when the pain roll succeeds', () => {
    damage(mind, grub, 5, always)
    expect(mind.state).toBe('pain')
  })

  it('does not stagger when the roll fails', () => {
    damage(mind, grub, 5, never)
    expect(mind.state).not.toBe('pain')
  })

  it('recovers from pain into chase', () => {
    damage(mind, grub, 5, always)
    advance(mind, seeing(6), grub.painTime + STEP)
    expect(mind.state).toBe('chase')
  })

  it('cannot be stunlocked forever by a fast weapon', () => {
    // A guaranteed stagger means a fast enough weapon pins an enemy in place
    // permanently and removes any reason to move. The roll is what prevents it,
    // so this asserts the roll is actually consulted.
    const rng = mulberry32(11)
    let staggers = 0
    for (let i = 0; i < 400; i++) {
      const m = createMind(grub)
      damage(m, grub, 1, rng)
      if (m.state === 'pain') staggers++
    }
    expect(staggers).toBeGreaterThan(0)
    expect(staggers).toBeLessThan(400)
  })

  it('dies at zero hp', () => {
    damage(mind, grub, grub.hp, never)
    expect(mind.state).toBe('dying')
    expect(mind.justDied).toBe(true)
    expect(isAlive(mind)).toBe(false)
  })

  it('gibs on a big enough single hit', () => {
    damage(mind, grub, grub.gibThreshold, never)
    expect(mind.gibbed).toBe(true)
  })

  it('does not gib on a small killing blow', () => {
    damage(mind, grub, grub.hp - 1, never)
    damage(mind, grub, 1, never)
    expect(mind.state).toBe('dying')
    expect(mind.gibbed).toBe(false)
  })

  it('forgets justDied as soon as the machine steps again', () => {
    // Not a nicety: it is the constraint that decides where the caller has to
    // read the flag. `damage` sets it and `step` clears it at the top of the
    // NEXT tick, so anything that wants to see a death must look before it
    // steps that creature -- and the player's shots land earlier in the same
    // tick than the creature update does.
    //
    // main.ts read it on the wrong side for the whole of G3 through G6: every
    // creature the player shot died unobserved, the kill counter never moved
    // off zero, and no death burst ever went off.
    damage(mind, grub, 9999, never)
    expect(mind.justDied).toBe(true)
    step(mind, grub, seeing(5), STEP)
    expect(mind.justDied).toBe(false)
  })

  it('settles from dying to dead', () => {
    damage(mind, grub, 999, never)
    advance(mind, seeing(6), grub.dyingTime + STEP)
    expect(mind.state).toBe('dead')
  })

  it('ignores further damage once dead', () => {
    damage(mind, grub, 999, never)
    const hp = mind.hp
    damage(mind, grub, 50, always)
    expect(mind.hp).toBe(hp)
    expect(mind.state).toBe('dying')
  })

  it('dies mid-windup without landing the strike', () => {
    advance(mind, seeing(6), grub.reactionTime + 2 * STEP)
    step(mind, grub, seeing(0.5), STEP)
    expect(mind.state).toBe('attack')
    damage(mind, grub, 999, never)
    const strikes = advance(mind, seeing(0.5), grub.attackWindup + 2 * STEP)
    expect(strikes).toHaveLength(0)
  })

  it('takes no action at all once dead', () => {
    damage(mind, grub, 999, never)
    advance(mind, seeing(6), grub.dyingTime + STEP)
    expect(step(mind, grub, seeing(1), STEP)).toEqual({ velocity: 0, turn: false })
  })

  it('clears the one-tick flags on the next step', () => {
    damage(mind, grub, 999, never)
    expect(mind.justDied).toBe(true)
    step(mind, grub, seeing(6), STEP)
    expect(mind.justDied).toBe(false)
  })
})

/**
 * Design floors for "does it get to fight back", measured at the attack range
 * under continuous Salt Shaker fire.
 *
 * These are targets, not observations: a creature that lands a hit in fewer
 * engagements than this is a target rather than an enemy. Each sits between
 * the rate WITHOUT the commit rule and the rate with it, so removing the rule
 * breaks them -- except the Slimebloat, which barely flinches by design
 * (`painChance` 0.15) and was never a victim of the stagger loop. Its entry is
 * a floor on the design, not a guard on the rule, and it is listed rather than
 * skipped so a future change that DOES make it staggerable gets caught.
 */
const FIGHTS_BACK: Record<string, number> = {
  grub: 0.35,
  spitter: 0.33,
  slimebloat: 0.9,
  brute: 0.8,
  shellback: 0.7,
  // Seven hundred health at forty-eight damage a second: she is never in any
  // danger of dying before she has answered.
  matriarch: 0.95,
}

describe('attack commitment', () => {
  /** Walk a fresh mind to the first tick of its wind-up. */
  const winding = (def: EnemyDef): EnemyMind => {
    const m = createMind(def)
    for (let i = 0; i < 600 && m.state !== 'attack'; i++) {
      step(m, def, seeing(def.attackRange * 0.5), STEP)
    }
    expect(m.state).toBe('attack')
    return m
  }

  /** Advance a wind-up to `fraction` of the way through it. */
  const intoWindup = (m: EnemyMind, def: EnemyDef, fraction: number) => {
    const target = def.attackWindup * (1 - fraction)
    for (let i = 0; i < 600 && m.timer > target; i++) {
      step(m, def, seeing(def.attackRange * 0.5), STEP)
    }
  }

  const each = Object.values(ENEMIES).map((d) => [d.id, d] as const)

  it.each(each)('%s can still be staggered early in the wind-up', (_id, def) => {
    // Commitment is a point in the wind-up, not a blanket immunity. Reading
    // the tell and shooting in time has to still work, or the creature is
    // simply unstoppable once it starts -- which is the opposite bug.
    const m = winding(def)
    damage(m, def, 1, always)
    expect(m.state).toBe('pain')
  })

  it.each(each)('%s cannot be staggered once the swing is committed', (_id, def) => {
    const m = winding(def)
    intoWindup(m, def, Math.min(1, def.commitAt + 0.2))
    damage(m, def, 1, always)
    expect(m.state).toBe('attack')
  })

  it.each(each)('%s still takes damage while committed', (_id, def) => {
    const m = winding(def)
    intoWindup(m, def, Math.min(1, def.commitAt + 0.2))
    const before = m.hp
    damage(m, def, 7, always)
    expect(m.hp).toBe(before - 7)
  })

  it.each(each)('%s dies mid-swing rather than finishing it', (_id, def) => {
    // Commitment must not outrank death, or a corpse gets a free hit.
    const m = winding(def)
    intoWindup(m, def, Math.min(1, def.commitAt + 0.2))
    damage(m, def, 9999, always)
    expect(m.state).toBe('dying')
  })

  /**
   * The regression the whole rule exists for.
   *
   * A stagger overwrites `timer`, which IS the wind-up clock, and the attack
   * cooldown keeps running through the stagger -- so before this rule a weapon
   * firing faster than the wind-up completed deleted attacks in a loop and the
   * creature died having never hit back. Measured over 400 seeded lives at the
   * ORIGINAL numbers, a Grub landed a strike in 0% of them and a Brute in 48%.
   *
   * Asserted over many seeds because the pain roll is random: one seed proves
   * nothing either way. Deliberately not asserted at 100% -- see the "can still
   * be staggered early" case above.
   */
  it.each(each)('%s fights back before it dies, under sustained fire', (_id, def) => {
    const SHOT_INTERVAL = 0.25
    const SHOT_DAMAGE = 12
    const LIVES = 200
    let fought = 0

    for (let seed = 1; seed <= LIVES; seed++) {
      const m = createMind(def)
      const rng = mulberry32(seed)
      const p = seeing(def.attackRange * 0.9)
      let struck = false
      let nextShot = 0
      for (let t = 0; isAlive(m) && t < 30; t += STEP) {
        step(m, def, p, STEP)
        if (m.didStrike) struck = true
        if (t >= nextShot) {
          damage(m, def, SHOT_DAMAGE, rng)
          nextShot = t + SHOT_INTERVAL
        }
      }
      if (struck) fought++
    }

    expect(fought / LIVES).toBeGreaterThanOrEqual(FIGHTS_BACK[def.id])
  })

  it('gives every enemy a fight-back floor', () => {
    // A new enemy type must state its floor rather than inherit silence.
    expect(Object.keys(FIGHTS_BACK).sort()).toEqual(Object.keys(ENEMIES).sort())
  })
})

describe('a second phase', () => {
  const boss = ENEMIES.matriarch
  const rage = boss.enrage!

  /** A mind at a given fraction of full health. */
  const hurt = (fraction: number): EnemyMind => {
    const m = createMind(boss)
    m.hp = boss.hp * fraction
    return m
  }

  it('fights by its first numbers while it is healthy', () => {
    expect(activeDef(hurt(1), boss).standoff).toBe(boss.standoff)
    expect(activeDef(hurt(1), boss).armour).toEqual(boss.armour)
  })

  it('swaps them once it is hurt past the threshold', () => {
    const enraged = activeDef(hurt(rage.below - 0.05), boss)
    expect(enraged.standoff).toBe(0)
    expect(enraged.armour).toBeNull()
    expect(enraged.charge).toBeGreaterThan(0)
    expect(enraged.projectile).toBeNull()
  })

  it('keeps everything the second phase does not mention', () => {
    // A partial, not a replacement. The creature is still the same creature.
    const enraged = activeDef(hurt(0.1), boss)
    expect(enraged.id).toBe(boss.id)
    expect(enraged.shape).toBe(boss.shape)
    expect(enraged.hp).toBe(boss.hp)
  })

  it('leaves a creature with one phase entirely alone', () => {
    // Every other creature in the game takes this path, so it has to be the
    // def itself and not a copy of it.
    const grubMind = createMind(grub)
    grubMind.hp = 1
    expect(activeDef(grubMind, grub)).toBe(grub)
  })

  it('changes what the machine actually does, not just what it reports', () => {
    // The point of the phase. While the plating holds she gives ground to keep
    // the player at throwing range; after it splits she closes. Asserted on
    // the intent, because a phase that reads differently and behaves the same
    // is decoration.
    const near = seeing(2)

    const healthy = hurt(1)
    for (let i = 0; i < 200; i++) step(healthy, boss, near, STEP)
    const backing = step(healthy, boss, near, STEP)

    const split = hurt(0.1)
    for (let i = 0; i < 200; i++) step(split, boss, near, STEP)
    const closing = step(split, boss, near, STEP)

    expect(backing.velocity, 'should be giving ground at two cells').toBeLessThan(0)
    expect(closing.velocity, 'should not still be giving ground').toBeGreaterThanOrEqual(0)
  })

  it('stops being armoured once the shell splits', () => {
    // Read through the active def, so the plating is part of the phase rather
    // than a fixed property of the body.
    const front = { x: 5, z: 4 }
    const healthy = {
      def: boss,
      mind: hurt(1),
      x: 5,
      z: 5,
      facing: 0,
      age: 0,
      lungeX: null,
      lungeZ: null,
    }
    const split = { ...healthy, mind: hurt(0.1) }
    expect(armourScale(healthy, front.x, front.z)).toBeLessThan(1)
    expect(armourScale(split, front.x, front.z)).toBe(1)
  })
})

describe('every enemy definition', () => {
  it.each(Object.values(ENEMIES).map((d) => [d.id, d] as const))(
    '%s runs the machine to death without getting stuck',
    (_id, def) => {
      const m = createMind(def)
      for (let i = 0; i < 2000; i++) step(m, def, seeing(0.5), STEP)
      expect(['chase', 'attack']).toContain(m.state)
      damage(m, def, 9999, never)
      for (let i = 0; i < 2000; i++) step(m, def, seeing(0.5), STEP)
      expect(m.state).toBe('dead')
    },
  )

  it.each(Object.values(ENEMIES).map((d) => [d.id, d] as const))(
    '%s has coherent numbers',
    (_id, def) => {
      expect(def.hp).toBeGreaterThan(0)
      expect(def.gibThreshold).toBeGreaterThanOrEqual(def.hp)
      expect(def.attackRange).toBeGreaterThan(def.radius)
      expect(def.sightRange).toBeGreaterThan(def.attackRange)
      expect(def.painChance).toBeGreaterThanOrEqual(0)
      expect(def.painChance).toBeLessThanOrEqual(1)
      expect(def.height).toBeGreaterThan(0)
      expect(def.height).toBeLessThanOrEqual(1)
    },
  )
})

describe('standoff', () => {
  const kiter = ENEMIES.spitter

  /** Walk the machine to a settled chase, past the reaction beat. */
  const chasing = (def = kiter, p: Perception = seeing(10)): EnemyMind => {
    const slug = createMind(def)
    for (let t = 0; t < def.reactionTime + STEP * 2; t += STEP) step(slug, def, p, STEP)
    return slug
  }

  it('gives ground when the player gets inside it', () => {
    const slug = chasing()
    slug.attackCooldown = 5 // reloading, so the attack branch cannot fire
    const intent = step(slug, kiter, seeing(kiter.standoff - 1), STEP)
    expect(intent.velocity).toBe(-kiter.speed)
    expect(intent.turn, 'it backs away without turning its back').toBe(true)
  })

  it('holds its ground at exactly the standoff distance', () => {
    const slug = chasing()
    slug.attackCooldown = 5
    expect(step(slug, kiter, seeing(kiter.standoff), STEP).velocity).toBe(0)
  })

  it('still attacks from inside the standoff rather than fleeing', () => {
    // The failure this guards: a kiter that retreats INSTEAD of attacking backs
    // into a wall, stays there, and becomes a free kill -- the most dangerous
    // thing in the room turned harmless by walking at it.
    const slug = chasing()
    slug.attackCooldown = 0
    const intent = step(slug, kiter, seeing(kiter.standoff - 1), STEP)
    expect(slug.state).toBe('attack')
    expect(intent.velocity).toBe(0)
  })

  it('closes as normal when the player is far off', () => {
    const slug = chasing()
    slug.attackCooldown = 5
    expect(step(slug, kiter, seeing(kiter.attackRange + 3), STEP).velocity).toBe(kiter.speed)
  })

  it('leaves an enemy with no standoff walking straight in', () => {
    const slug = chasing(grub, seeing(6))
    slug.attackCooldown = 5
    expect(grub.standoff).toBe(0)
    expect(step(slug, grub, seeing(0.5), STEP).velocity).toBe(0)
    expect(step(slug, grub, seeing(6), STEP).velocity).toBe(grub.speed)
  })

  it('does not back away from a player it has never noticed', () => {
    // Reachable, not synthetic: shoot a sleeping slug from outside its cone
    // and `damage` puts it in pain and then in chase without it ever having
    // seen anyone. Without the guard it moonwalks away from a player it does
    // not know is there.
    //
    // Sight is broken and the cooldown is long on purpose. With either of them
    // available the attack branch answers first and this passes whatever the
    // standoff rule does -- which is exactly how the first version of this
    // test managed to survive deleting the guard it was written for.
    const slug = createMind(kiter)
    slug.state = 'chase'
    slug.attackCooldown = 5
    const unseen: Perception = { distance: 1, hasLineOfSight: false, angleToPlayer: Math.PI }

    expect(slug.provoked).toBe(false)
    expect(step(slug, kiter, unseen, STEP).velocity).toBe(0)
  })
})

describe('charge', () => {
  const brute = { ...grub, charge: 9, attackWindup: 0.4, attackRange: 1.5 }

  it('closes during its own wind-up', () => {
    const slug = createMind(brute)
    slug.state = 'chase'
    slug.provoked = true
    step(slug, brute, seeing(1), STEP)
    expect(slug.state).toBe('attack')

    const intent = step(slug, brute, seeing(1), STEP)
    expect(intent.velocity).toBe(brute.charge)
  })

  it('plants its feet if it has no charge', () => {
    const slug = createMind(grub)
    slug.state = 'chase'
    slug.provoked = true
    step(slug, grub, seeing(0.5), STEP)
    expect(slug.state).toBe('attack')
    expect(step(slug, grub, seeing(0.5), STEP).velocity).toBe(0)
  })

  it('stops the moment the strike lands', () => {
    // Otherwise it keeps lunging through the player after connecting.
    const slug = createMind(brute)
    slug.state = 'chase'
    slug.provoked = true
    step(slug, brute, seeing(1), STEP)

    // `didStrike` is a one-tick flag, so the intent has to be caught on the
    // tick it is raised rather than read after the loop has run past it.
    let onStrike: { velocity: number; turn: boolean } | null = null
    for (let t = 0; t < brute.attackWindup + STEP * 2; t += STEP) {
      const intent = step(slug, brute, seeing(1), STEP)
      if (slug.didStrike) onStrike = intent
    }
    expect(onStrike, 'the strike never landed').not.toBeNull()
    expect(onStrike?.velocity).toBe(0)
  })
})
