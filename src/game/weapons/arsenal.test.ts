import { beforeEach, describe, expect, it } from 'vitest'
import {
  addAmmo,
  createArsenal,
  cycleWeapon,
  damageAtRange,
  definition,
  fire,
  giveWeapon,
  hasAmmoFor,
  LOWER_TIME,
  selectSlot,
  selectWeapon,
  tickArsenal,
  type Arsenal,
} from './arsenal.ts'
import { WEAPONS } from './definitions.ts'
import { mulberry32 } from '../engine/math.ts'

const STEP = 1 / 60
/** Run the arsenal forward in real fixed steps, as the game loop would. */
const advance = (a: Arsenal, seconds: number) => {
  for (let t = 0; t < seconds; t += STEP) tickArsenal(a, STEP)
}

let arsenal: Arsenal
let rng: () => number

beforeEach(() => {
  arsenal = createArsenal()
  rng = mulberry32(42)
})

describe('starting state', () => {
  it('starts with the salt shaker and nothing else', () => {
    expect(arsenal.current).toBe('saltshaker')
    expect([...arsenal.owned]).toEqual(['saltshaker'])
  })

  it('can always fire the salt shaker, because it takes no ammo', () => {
    // A player who burns every pool must still be able to kill a Grub, or a
    // level becomes unwinnable.
    expect(hasAmmoFor(arsenal, WEAPONS.saltshaker)).toBe(true)
    expect(fire(arsenal, rng).fired).toBe(true)
  })
})

describe('fire-rate gating', () => {
  it('refuses a second shot inside the cooldown', () => {
    expect(fire(arsenal, rng).fired).toBe(true)
    expect(fire(arsenal, rng)).toMatchObject({ fired: false, reason: 'cooldown' })
  })

  it('allows the next shot once the cooldown elapses', () => {
    fire(arsenal, rng)
    advance(arsenal, WEAPONS.saltshaker.cooldown + STEP)
    expect(fire(arsenal, rng).fired).toBe(true)
  })

  it('does not let spamming fire beat the rate limit', () => {
    // The case that matters: fire() called every frame for a second should
    // yield exactly the weapon's rate, not one shot per frame.
    let shots = 0
    for (let t = 0; t < 1; t += STEP) {
      if (fire(arsenal, rng).fired) shots++
      tickArsenal(arsenal, STEP)
    }
    const expected = Math.floor(1 / WEAPONS.saltshaker.cooldown)
    expect(shots).toBeGreaterThanOrEqual(expected)
    expect(shots).toBeLessThanOrEqual(expected + 1)
  })
})

describe('ammo', () => {
  beforeEach(() => {
    giveWeapon(arsenal, 'grinder')
    selectWeapon(arsenal, 'grinder')
    advance(arsenal, LOWER_TIME + WEAPONS.grinder.raiseTime + STEP)
  })

  it('consumes exactly ammoPerShot', () => {
    addAmmo(arsenal, 'coarse', 10)
    fire(arsenal, rng)
    expect(arsenal.ammo.coarse).toBe(10 - WEAPONS.grinder.ammoPerShot)
  })

  it('refuses to fire on an empty pool and does not go negative', () => {
    expect(arsenal.ammo.coarse).toBe(0)
    expect(fire(arsenal, rng)).toMatchObject({ fired: false, reason: 'no-ammo' })
    expect(arsenal.ammo.coarse).toBe(0)
  })

  it('does not start the cooldown on a refused shot', () => {
    fire(arsenal, rng)
    expect(arsenal.cooldown).toBe(0)
  })

  it('caps at the pool maximum and reports what was taken', () => {
    const taken = addAmmo(arsenal, 'coarse', 9999)
    expect(taken).toBe(arsenal.ammoMax.coarse)
    expect(arsenal.ammo.coarse).toBe(arsenal.ammoMax.coarse)
    expect(addAmmo(arsenal, 'coarse', 10)).toBe(0)
  })
})

describe('weapon switching', () => {
  beforeEach(() => giveWeapon(arsenal, 'grinder'))

  it('lowers, swaps at the bottom, then raises', () => {
    expect(selectWeapon(arsenal, 'grinder')).toBe(true)
    expect(arsenal.phase).toBe('lowering')
    // Still holding the old weapon while it lowers.
    expect(arsenal.current).toBe('saltshaker')

    advance(arsenal, LOWER_TIME + STEP)
    expect(arsenal.phase).toBe('raising')
    expect(arsenal.current).toBe('grinder')

    advance(arsenal, WEAPONS.grinder.raiseTime + STEP)
    expect(arsenal.phase).toBe('ready')
  })

  it('cannot fire mid-switch', () => {
    selectWeapon(arsenal, 'grinder')
    expect(fire(arsenal, rng)).toMatchObject({ fired: false, reason: 'switching' })
    advance(arsenal, LOWER_TIME + STEP)
    expect(fire(arsenal, rng)).toMatchObject({ fired: false, reason: 'switching' })
  })

  it('refuses a weapon the player does not own', () => {
    const bare = createArsenal()
    expect(selectWeapon(bare, 'grinder')).toBe(false)
    expect(bare.phase).toBe('ready')
  })

  it('refuses reselecting the weapon already held', () => {
    expect(selectWeapon(arsenal, 'saltshaker')).toBe(false)
    expect(arsenal.phase).toBe('ready')
  })

  it('drops switch input mid-switch rather than queueing it', () => {
    // Queueing means mashing 1-2-1-2 builds a backlog the player has to watch
    // play out, which reads as the game being stuck.
    selectWeapon(arsenal, 'grinder')
    expect(selectWeapon(arsenal, 'saltshaker')).toBe(false)
    advance(arsenal, LOWER_TIME + WEAPONS.grinder.raiseTime + 2 * STEP)
    expect(arsenal.current).toBe('grinder')
    expect(arsenal.phase).toBe('ready')
  })

  it('always settles in a consistent state under mashed input', () => {
    for (let i = 0; i < 400; i++) {
      selectSlot(arsenal, (i % 2) + 1)
      tickArsenal(arsenal, STEP)
    }
    advance(arsenal, 2)
    expect(arsenal.phase).toBe('ready')
    expect(arsenal.pending).toBeNull()
    expect(arsenal.owned.has(arsenal.current)).toBe(true)
  })

  it('selects by number key', () => {
    expect(selectSlot(arsenal, 2)).toBe(true)
    advance(arsenal, LOWER_TIME + WEAPONS.grinder.raiseTime + STEP)
    expect(arsenal.current).toBe('grinder')
  })

  it('ignores a slot with no weapon in it', () => {
    expect(selectSlot(arsenal, 9)).toBe(false)
  })

  it('cycles through owned weapons and wraps', () => {
    expect(cycleWeapon(arsenal, 1)).toBe(true)
    advance(arsenal, LOWER_TIME + WEAPONS.grinder.raiseTime + STEP)
    expect(arsenal.current).toBe('grinder')

    expect(cycleWeapon(arsenal, 1)).toBe(true)
    advance(arsenal, LOWER_TIME + WEAPONS.saltshaker.raiseTime + STEP)
    expect(arsenal.current).toBe('saltshaker')
  })

  it('does not cycle with only one weapon', () => {
    expect(cycleWeapon(createArsenal(), 1)).toBe(false)
  })
})

describe('spread', () => {
  it('is reproducible for a given seed', () => {
    const a = fire(createArsenal(), mulberry32(7)).angles
    const b = fire(createArsenal(), mulberry32(7)).angles
    expect(a).toEqual(b)
  })

  it('differs between seeds, so shots are not identical', () => {
    const a = fire(createArsenal(), mulberry32(1)).angles
    const b = fire(createArsenal(), mulberry32(2)).angles
    expect(a).not.toEqual(b)
  })

  it('emits one angle per pellet', () => {
    const a = createArsenal()
    giveWeapon(a, 'grinder')
    selectWeapon(a, 'grinder')
    advance(a, LOWER_TIME + WEAPONS.grinder.raiseTime + STEP)
    addAmmo(a, 'coarse', 5)
    expect(fire(a, rng).angles).toHaveLength(WEAPONS.grinder.pellets)
  })

  it("puts the shotgun's first pellet dead centre so point-blank aim is honest", () => {
    const a = createArsenal()
    giveWeapon(a, 'grinder')
    selectWeapon(a, 'grinder')
    advance(a, LOWER_TIME + WEAPONS.grinder.raiseTime + STEP)
    addAmmo(a, 'coarse', 5)
    expect(fire(a, rng).angles![0]).toBe(0)
  })

  it('keeps every pellet inside the weapon spread cone', () => {
    const a = createArsenal()
    giveWeapon(a, 'grinder')
    selectWeapon(a, 'grinder')
    advance(a, LOWER_TIME + WEAPONS.grinder.raiseTime + STEP)
    addAmmo(a, 'coarse', 60)
    const r = mulberry32(3)
    for (let shot = 0; shot < 40; shot++) {
      const result = fire(a, r)
      if (!result.fired) {
        advance(a, WEAPONS.grinder.cooldown + STEP)
        continue
      }
      for (const angle of result.angles!) {
        expect(Math.abs(angle)).toBeLessThanOrEqual(WEAPONS.grinder.spread)
      }
      advance(a, WEAPONS.grinder.cooldown + STEP)
    }
  })
})

describe('damageAtRange', () => {
  const def = WEAPONS.saltshaker

  it('is full damage at the muzzle', () => {
    expect(damageAtRange(def, 0)).toBeCloseTo(def.damage, 9)
  })

  it('falls to the floor value at the edge of range', () => {
    expect(damageAtRange(def, def.range - 0.001)).toBeCloseTo(def.damage * def.falloff, 2)
  })

  it('is zero beyond range rather than negative', () => {
    expect(damageAtRange(def, def.range)).toBe(0)
    expect(damageAtRange(def, def.range * 10)).toBe(0)
  })

  it('decreases monotonically', () => {
    let previous = Infinity
    for (let d = 0; d < def.range; d += def.range / 50) {
      const dmg = damageAtRange(def, d)
      expect(dmg).toBeLessThanOrEqual(previous)
      previous = dmg
    }
  })
})

describe('definitions', () => {
  it('gives every weapon a unique slot', () => {
    const slots = Object.values(WEAPONS).map((w) => w.slot)
    expect(new Set(slots).size).toBe(slots.length)
  })

  it('matches each definition id to its key', () => {
    for (const [key, def] of Object.entries(WEAPONS)) expect(def.id).toBe(key)
  })

  it('reports the definition of the held weapon', () => {
    expect(definition(arsenal).id).toBe('saltshaker')
  })
})
