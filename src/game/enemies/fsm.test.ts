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
    expect(intent).toEqual({ move: false, turn: false })
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
    expect(step(mind, grub, seeing(6), STEP)).toMatchObject({ move: false, turn: true })
  })
})

describe('chase', () => {
  beforeEach(() => {
    advance(mind, seeing(6), grub.reactionTime + 2 * STEP)
  })

  it('moves toward a visible player', () => {
    expect(step(mind, grub, seeing(6), STEP)).toMatchObject({ move: true, turn: true })
  })

  it('keeps coming after losing sight, so cover is not an off switch', () => {
    expect(step(mind, grub, blind, STEP).move).toBe(true)
    expect(mind.state).toBe('chase')
  })

  it('attacks once inside range', () => {
    step(mind, grub, seeing(grub.attackRange - 0.1), STEP)
    expect(mind.state).toBe('attack')
  })

  it('holds position in range while reloading rather than shuffling closer', () => {
    advance(mind, seeing(0.5), grub.attackWindup + 2 * STEP)
    expect(mind.attackCooldown).toBeGreaterThan(0)
    expect(step(mind, grub, seeing(0.5), STEP).move).toBe(false)
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
    expect(step(mind, grub, seeing(1), STEP)).toEqual({ move: false, turn: false })
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
