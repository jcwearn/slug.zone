import { beforeEach, describe, expect, it } from 'vitest'
import {
  addArmour,
  ARMOUR_ABSORB,
  createHealth,
  damagePlayer,
  faceBucket,
  heal,
  IMMUNITY_TIME,
  tickHealth,
  type PlayerHealth,
} from './health.ts'

const STEP = 1 / 60
const advance = (h: PlayerHealth, seconds: number) => {
  for (let t = 0; t < seconds; t += STEP) tickHealth(h, STEP)
}

let health: PlayerHealth
beforeEach(() => {
  health = createHealth()
})

describe('damage', () => {
  it('takes health when unarmoured', () => {
    const r = damagePlayer(health, 25)
    expect(health.hp).toBe(75)
    expect(r).toMatchObject({ applied: true, hpLost: 25, armourLost: 0, died: false })
  })

  it('ignores zero and negative damage', () => {
    expect(damagePlayer(health, 0).applied).toBe(false)
    expect(damagePlayer(health, -50).applied).toBe(false)
    expect(health.hp).toBe(100)
  })

  it('dies at zero and clamps rather than going negative', () => {
    const r = damagePlayer(health, 500)
    expect(health.hp).toBe(0)
    expect(health.dead).toBe(true)
    expect(r.died).toBe(true)
  })

  it('ignores damage once dead', () => {
    damagePlayer(health, 500)
    expect(damagePlayer(health, 20).applied).toBe(false)
  })
})

describe('armour', () => {
  beforeEach(() => addArmour(health, 100))

  it('absorbs its share and passes the rest through', () => {
    damagePlayer(health, 30)
    expect(health.armour).toBeCloseTo(100 - 30 * ARMOUR_ABSORB, 9)
    expect(health.hp).toBeCloseTo(100 - 30 * (1 - ARMOUR_ABSORB), 9)
  })

  it('absorbs a fraction, so it helps as much against big hits as small', () => {
    // A flat reduction would make chip damage free and heavy hits unchanged,
    // which inverts what armour is for.
    const small = createHealth()
    addArmour(small, 100)
    damagePlayer(small, 6)
    const smallRatio = (100 - small.hp) / 6

    const big = createHealth()
    addArmour(big, 100)
    damagePlayer(big, 60)
    const bigRatio = (100 - big.hp) / 60

    expect(smallRatio).toBeCloseTo(bigRatio, 6)
  })

  it('stops absorbing once exhausted, without going negative', () => {
    health.armour = 2
    damagePlayer(health, 60)
    expect(health.armour).toBe(0)
    expect(health.hp).toBe(100 - 58)
  })

  it('caps at its maximum and reports what was taken', () => {
    expect(addArmour(health, 500)).toBe(0)
    expect(health.armour).toBe(health.armourMax)
  })
})

describe('immunity', () => {
  it('ignores a second hit inside the window', () => {
    // Four Grubs striking on the same tick would otherwise delete a third of
    // your health in one frame, with one flash and no chance to react.
    damagePlayer(health, 10)
    expect(damagePlayer(health, 10).applied).toBe(false)
    expect(health.hp).toBe(90)
  })

  it('accepts the next hit once the window passes', () => {
    damagePlayer(health, 10)
    advance(health, IMMUNITY_TIME + STEP)
    expect(damagePlayer(health, 10).applied).toBe(true)
    expect(health.hp).toBe(80)
  })

  it('still kills through the window if the first hit was lethal', () => {
    damagePlayer(health, 999)
    expect(health.dead).toBe(true)
  })

  it('caps sustained damage to a survivable rate rather than a one-frame delete', () => {
    // Ten attackers all striking every frame for a second.
    let t = 0
    while (t < 1 && !health.dead) {
      for (let i = 0; i < 10; i++) damagePlayer(health, 6)
      tickHealth(health, STEP)
      t += STEP
    }
    const maxHits = Math.ceil(1 / IMMUNITY_TIME) + 1
    expect(100 - health.hp).toBeLessThanOrEqual(maxHits * 6)
  })
})

describe('healing', () => {
  it('restores health up to the cap and reports what was taken', () => {
    damagePlayer(health, 40)
    expect(heal(health, 25)).toBe(25)
    expect(health.hp).toBe(85)
    expect(heal(health, 999)).toBe(15)
    expect(health.hp).toBe(100)
  })

  it('does not revive the dead', () => {
    damagePlayer(health, 999)
    expect(heal(health, 50)).toBe(0)
    expect(health.hp).toBe(0)
  })
})

describe('pain flash', () => {
  it('rises on damage and decays to nothing', () => {
    damagePlayer(health, 30)
    expect(health.painFlash).toBeGreaterThan(0)
    advance(health, 3)
    expect(health.painFlash).toBe(0)
  })

  it('flashes harder for a bigger hit', () => {
    const light = createHealth()
    damagePlayer(light, 5)
    const heavy = createHealth()
    damagePlayer(heavy, 40)
    expect(heavy.painFlash).toBeGreaterThan(light.painFlash)
  })

  it('never exceeds 1, however hard the hit', () => {
    damagePlayer(health, 95)
    expect(health.painFlash).toBeLessThanOrEqual(1)
  })
})

describe('faceBucket', () => {
  it('walks through every bucket as health drains', () => {
    const seen = new Set<number>()
    const h = createHealth()
    for (let hp = 100; hp >= 0; hp -= 1) {
      h.hp = hp
      seen.add(faceBucket(h))
    }
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4])
  })

  it('is worst-but-one at a sliver of health, and dead only when dead', () => {
    health.hp = 1
    expect(faceBucket(health)).toBe(4)
    damagePlayer(health, 999)
    expect(faceBucket(health)).toBe(5)
  })

  it('never decreases as health drops', () => {
    let previous = -1
    const h = createHealth()
    for (let hp = 100; hp >= 0; hp -= 1) {
      h.hp = hp
      const bucket = faceBucket(h)
      expect(bucket).toBeGreaterThanOrEqual(previous)
      previous = bucket
    }
  })
})

describe('justDied', () => {
  it('is set on the tick of death and cleared on the next', () => {
    damagePlayer(health, 999)
    expect(health.justDied).toBe(true)
    tickHealth(health, STEP)
    expect(health.justDied).toBe(false)
    expect(health.dead).toBe(true)
  })
})
