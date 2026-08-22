import { describe, expect, it } from 'vitest'
import { separateEnemies, spawnEnemy, updateEnemy, type Enemy } from './enemy.ts'
import { damage } from './fsm.ts'
import { parseLevel } from '../world/level.ts'
import { isSolid } from '../world/level.ts'
import { circleFits } from '../engine/collision.ts'
import e1m1 from '../world/levels/e1m1.ts'

const level = parseLevel(e1m1)
const STEP = 1 / 60

const gap = (a: Enemy, b: Enemy) => Math.hypot(a.x - b.x, a.z - b.z)
const minimumGap = (a: Enemy, b: Enemy) => a.def.radius + b.def.radius

describe('separateEnemies', () => {
  it('pushes two overlapping slugs apart', () => {
    const a = spawnEnemy('grub', 5.5, 1.5)
    const b = spawnEnemy('grub', 5.6, 1.5)
    const before = gap(a, b)

    separateEnemies([a, b], level)
    expect(gap(a, b)).toBeGreaterThan(before)
  })

  it('separates them fully within a few ticks', () => {
    const a = spawnEnemy('grub', 5.5, 1.5)
    const b = spawnEnemy('grub', 5.7, 1.5)
    for (let i = 0; i < 10; i++) separateEnemies([a, b], level)
    expect(gap(a, b)).toBeGreaterThanOrEqual(minimumGap(a, b) - 1e-6)
  })

  it('separates slugs standing in exactly the same spot', () => {
    // Two traps here. The difference vector is exactly zero, so the direction
    // cannot come from it -- and if the coincident fallback is folded into
    // `distance` before the push is computed, the push comes out NEGATIVE and
    // the pair pulls together.
    //
    // The first version of this asserted only `gap > 0`, which a negative push
    // satisfies perfectly well: they still end up a nonzero distance apart,
    // just on the wrong sides of each other and still overlapping. It has to
    // be the full minimum gap.
    const a = spawnEnemy('grub', 5.5, 1.5)
    const b = spawnEnemy('grub', 5.5, 1.5)
    for (let i = 0; i < 10; i++) separateEnemies([a, b], level)
    expect(Number.isFinite(a.x)).toBe(true)
    expect(Number.isFinite(b.x)).toBe(true)
    expect(gap(a, b)).toBeGreaterThanOrEqual(minimumGap(a, b) - 1e-6)
  })

  it('is deterministic, so a coincident pair resolves the same way every time', () => {
    const run = () => {
      const a = spawnEnemy('grub', 5.5, 1.5)
      const b = spawnEnemy('grub', 5.5, 1.5)
      for (let i = 0; i < 5; i++) separateEnemies([a, b], level)
      return [a.x, a.z, b.x, b.z]
    }
    expect(run()).toEqual(run())
  })

  it('leaves slugs that are already apart where they are', () => {
    const a = spawnEnemy('grub', 4.5, 1.5)
    const b = spawnEnemy('grub', 7.5, 1.5)
    separateEnemies([a, b], level)
    expect(a.x).toBe(4.5)
    expect(b.x).toBe(7.5)
  })

  it('never pushes anyone into a wall', () => {
    // A slug jammed against a wall by its neighbours must not be shoved
    // through it -- that would undo the reason enemies collide at all.
    const crowd = [
      spawnEnemy('grub', 1.55, 1.55),
      spawnEnemy('grub', 1.6, 1.5),
      spawnEnemy('grub', 1.5, 1.6),
      spawnEnemy('spitter', 1.7, 1.7),
    ]
    for (let i = 0; i < 30; i++) {
      separateEnemies(crowd, level)
      for (const e of crowd) {
        expect(isSolid(level, Math.floor(e.x), Math.floor(e.z)), `${e.x},${e.z}`).toBe(false)
        expect(circleFits(level, e.x, e.z, e.def.radius)).toBe(true)
      }
    }
  })

  it('ignores corpses, so a dead slug does not block the living', () => {
    const corpse = spawnEnemy('grub', 5.5, 1.5)
    damage(corpse.mind, corpse.def, 999, () => 1)
    const walker = spawnEnemy('grub', 5.5, 1.5)

    separateEnemies([corpse, walker], level)
    expect(corpse.x).toBe(5.5)
    expect(corpse.z).toBe(1.5)
  })

  it('keeps a pack chasing the same player from stacking into one slug', () => {
    // The reported bug: three Grubs converging on one point and merging into a
    // single composite creature.
    const pack = [
      spawnEnemy('grub', 4.5, 1.5),
      spawnEnemy('grub', 6.5, 1.5),
      spawnEnemy('grub', 8.5, 1.5),
    ]
    for (const e of pack) {
      e.mind.state = 'chase'
      e.mind.provoked = true
    }

    for (let t = 0; t < 10; t += STEP) {
      for (const e of pack) updateEnemy(e, level, 1.5, 1.5, STEP)
      separateEnemies(pack, level)
    }

    for (let i = 0; i < pack.length; i++) {
      for (let j = i + 1; j < pack.length; j++) {
        expect(
          gap(pack[i], pack[j]),
          `grub ${i} and ${j} overlapping after the chase`,
        ).toBeGreaterThan(minimumGap(pack[i], pack[j]) * 0.85)
      }
    }
  })
})
