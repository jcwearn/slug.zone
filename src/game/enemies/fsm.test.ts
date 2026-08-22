import { beforeEach, describe, expect, it } from 'vitest'
import {
  canSee,
  createMind,
  damage,
  isAlive,
  step,
  type EnemyMind,
  type Perception,
} from './fsm.ts'
import { ENEMIES } from './definitions.ts'
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
