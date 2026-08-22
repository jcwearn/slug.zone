import { describe, expect, it } from 'vitest'
import {
  collect,
  createPickups,
  PICKUP_RADIUS,
  pickupsTouching,
  resetPickups,
  type Collector,
  type Pickup,
} from './pickups.ts'
import { ITEMS } from './definitions.ts'
import { createHealth } from '../player/health.ts'
import { createArsenal } from '../weapons/arsenal.ts'
import { PLAYER_RADIUS } from '../engine/collision.ts'
import { parseLevel } from '../world/level.ts'
import type { LevelSource } from '../world/types.ts'

/**
 * The rule under test is Doom's, and it is the whole reason `heal`,
 * `addArmour` and `addAmmo` report what they ACTUALLY took: an item you are
 * too full to benefit from must not be consumed. Getting that backwards is
 * invisible in play until the fight where you needed the medikit you had
 * already walked over at 100%.
 */

const target = (): Collector => ({
  health: createHealth(),
  arsenal: createArsenal(),
  keys: new Set<string>(),
})

describe('collect', () => {
  it('heals, and reports what it gave', () => {
    const into = target()
    into.health.hp = 50
    expect(collect(ITEMS.health, into)).toEqual({ taken: true, message: 'GOT MEDIKIT' })
    expect(into.health.hp).toBe(75)
  })

  it('refuses a medikit at full health and leaves hp alone', () => {
    const into = target()
    expect(into.health.hp).toBe(into.health.hpMax)
    expect(collect(ITEMS.health, into).taken).toBe(false)
    expect(into.health.hp).toBe(100)
  })

  it('takes a medikit that only partly fits, and clamps at the cap', () => {
    // The interesting case between the two above: it must be consumed even
    // though most of it is wasted, because it did something.
    const into = target()
    into.health.hp = 90
    expect(collect(ITEMS.health, into).taken).toBe(true)
    expect(into.health.hp).toBe(100)
  })

  it('refuses armour at the cap and takes it below', () => {
    const into = target()
    into.health.armour = into.health.armourMax
    expect(collect(ITEMS.armour, into).taken).toBe(false)

    into.health.armour = 80
    expect(collect(ITEMS.armour, into).taken).toBe(true)
    expect(into.health.armour).toBe(100)
  })

  it('refuses ammo at the cap and takes it below', () => {
    const into = target()
    into.arsenal.ammo.coarse = into.arsenal.ammoMax.coarse
    expect(collect(ITEMS.coarse, into).taken).toBe(false)
    expect(into.arsenal.ammo.coarse).toBe(60)

    into.arsenal.ammo.coarse = 59
    expect(collect(ITEMS.coarse, into).taken).toBe(true)
    expect(into.arsenal.ammo.coarse).toBe(60)
  })

  it('gives a new weapon along with the rounds it arrives loaded with', () => {
    const into = target()
    expect(into.arsenal.owned.has('grinder')).toBe(false)
    expect(collect(ITEMS.grinder, into)).toEqual({ taken: true, message: 'GOT THE GRINDER' })
    expect(into.arsenal.owned.has('grinder')).toBe(true)
    expect(into.arsenal.ammo.coarse).toBe(8)
  })

  it('takes a duplicate weapon for its ammo alone', () => {
    const into = target()
    collect(ITEMS.grinder, into)
    expect(collect(ITEMS.grinder, into).taken).toBe(true)
    expect(into.arsenal.ammo.coarse).toBe(16)
  })

  it('refuses a duplicate weapon when the ammo pool is already full', () => {
    // Owning it and being unable to carry another round means the pickup would
    // do literally nothing, so it stays on the floor.
    const into = target()
    collect(ITEMS.grinder, into)
    into.arsenal.ammo.coarse = into.arsenal.ammoMax.coarse
    expect(collect(ITEMS.grinder, into).taken).toBe(false)
  })

  it('files a keycard under its colour, not its item id', () => {
    // The HUD pips look up 'red'; the level authors 'redkey'. If the item id
    // leaked through, the pip would never light.
    const into = target()
    expect(collect(ITEMS.redkey, into).taken).toBe(true)
    expect([...into.keys]).toEqual(['red'])
    expect(into.keys.has('redkey')).toBe(false)
  })

  it('takes a keycard regardless of how full anything else is', () => {
    const into = target()
    into.health.hp = into.health.hpMax
    into.arsenal.ammo.coarse = into.arsenal.ammoMax.coarse
    expect(collect(ITEMS.bluekey, into).taken).toBe(true)
  })

  it('names every item it hands over', () => {
    // A message of '' would render as an empty band rather than a notice.
    const into = target()
    for (const def of Object.values(ITEMS)) {
      const result = collect(def, { ...into, health: createHealth(), arsenal: createArsenal() })
      if (result.taken) expect(result.message).not.toBe('')
    }
  })
})

describe('pickupsTouching', () => {
  const item = (x: number, z: number): Pickup => ({ def: ITEMS.health, x, z, taken: false })

  it.each([0.1, PLAYER_RADIUS, 0.75, 1.5])(
    'reaches exactly radius + PICKUP_RADIUS for a body of radius %s',
    (radius) => {
      // Swept across several body radii on purpose. Asserting one boundary
      // against `PLAYER_RADIUS + PICKUP_RADIUS` would be worthless -- both
      // sides come from the same two constants, so an implementation that
      // ignored the radius it was handed and used a fixed distance would agree
      // with the test at every value of them. Varying the radius is what makes
      // the assertion about the SUM rather than about a number.
      const reach = radius + PICKUP_RADIUS
      const items = [item(0, 0)]

      expect(pickupsTouching(items, reach - 1e-3, 0, radius)).toHaveLength(1)
      expect(pickupsTouching(items, reach + 1e-3, 0, radius)).toHaveLength(0)
    },
  )

  it('gives an item a wider footprint than the player, so it is walkable-over', () => {
    // An item you have to stand exactly on top of reads as broken rather than
    // as precise. This is the design decision, not an implementation detail.
    expect(PICKUP_RADIUS).toBeGreaterThan(PLAYER_RADIUS)
  })

  it('ignores what has already been collected', () => {
    const items = [item(0, 0)]
    items[0].taken = true
    expect(pickupsTouching(items, 0, 0, PLAYER_RADIUS)).toHaveLength(0)
  })

  it('returns everything in a heap, not just the first', () => {
    const items = [item(0, 0), item(0.1, 0.1), item(9, 9)]
    expect(pickupsTouching(items, 0, 0, PLAYER_RADIUS)).toHaveLength(2)
  })
})

describe('createPickups', () => {
  const source = (entities: LevelSource['entities']): LevelSource => ({
    id: 'test',
    name: 'Test',
    music: 'none',
    cellSize: 4,
    wallHeight: 4,
    floorTex: 'damp',
    ceilingTex: 'concrete',
    fog: 0.05,
    legend: { '#': { wall: 'brick' }, '.': { floor: true } },
    grid: ['#####', '#...#', '#####'],
    entities,
    par: 1000,
  })

  it('builds one uncollected item per pickup entity, ignoring everything else', () => {
    const level = parseLevel(
      source([
        { type: 'player', x: 1.5, z: 1.5 },
        { type: 'grub', x: 2.5, z: 1.5 },
        { type: 'pickup', item: 'health', x: 3.5, z: 1.5 },
      ]),
    )
    const pickups = createPickups(level)
    expect(pickups).toHaveLength(1)
    expect(pickups[0].def.id).toBe('health')
    expect(pickups[0].taken).toBe(false)
  })

  it('throws on an item nothing in the catalogue answers to, naming it', () => {
    // Otherwise a typo is an item that silently never appears, which looks
    // exactly like a level design decision.
    const level = parseLevel(
      source([
        { type: 'player', x: 1.5, z: 1.5 },
        { type: 'pickup', item: 'helth', x: 3.5, z: 1.5 },
      ]),
    )
    expect(() => createPickups(level)).toThrow(/unknown pickup item: helth/)
  })

  it('throws on a pickup with no item at all', () => {
    const level = parseLevel(
      source([
        { type: 'player', x: 1.5, z: 1.5 },
        { type: 'pickup', x: 3.5, z: 1.5 },
      ]),
    )
    expect(() => createPickups(level)).toThrow(/unknown pickup item/)
  })
})

describe('resetPickups', () => {
  it('puts everything back on the floor', () => {
    const pickups: Pickup[] = [
      { def: ITEMS.health, x: 1, z: 1, taken: true },
      { def: ITEMS.coarse, x: 2, z: 2, taken: false },
    ]
    resetPickups(pickups)
    expect(pickups.map((p) => p.taken)).toEqual([false, false])
  })
})
