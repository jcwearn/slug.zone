import { describe, expect, it } from 'vitest'
import { hasLineOfSight } from '../engine/collision.ts'
import { parseLevel } from '../world/level.ts'
import { worldSpace } from '../world/space.ts'
import {
  armourScale,
  burstDamage,
  enemyCylinder,
  spawnEnemy,
  targetable,
  updateEnemy,
} from './enemy.ts'
import { damage, isAlive } from './fsm.ts'
import { ENEMIES } from './definitions.ts'
import { nearestHit, verticalAutoAim } from './hitscan.ts'
import { createArsenal, damageAtRange, definition, fire, tickArsenal } from '../weapons/arsenal.ts'
import { aimDirection } from '../player/aim.ts'
import { mulberry32 } from '../engine/math.ts'
import { EYE_HEIGHT } from '../player/controller.ts'
import e1m1 from '../world/levels/e1m1.ts'

/**
 * End-to-end combat, without a browser.
 *
 * Every piece below is unit-tested on its own, and that is exactly why this
 * exists: aim, hitscan, damage, ammo and the state machine can each be
 * individually correct while the wiring between them is wrong. A sign error in
 * the bearing or a units mix-up between grid and world would leave every unit
 * test green and the game unplayable -- which has already happened twice here.
 */

const level = parseLevel(e1m1)
const space = worldSpace(level)
const s = level.cellSize
const STEP = 1 / 60
const eyeY = space.eyeY(EYE_HEIGHT)
const AUTOAIM_CONE = 0.25

/** Yaw that points from (fromX,fromZ) at (toX,toZ), player convention. */
const facing = (fromX: number, fromZ: number, toX: number, toZ: number) =>
  Math.atan2(-(toX - fromX), -(toZ - fromZ))

describe('shooting an enemy', () => {
  it('kills a grub in a plausible number of salt shaker shots', () => {
    const rng = mulberry32(5)
    const [px, pz] = [1.5, 1.5]
    const grub = spawnEnemy('grub', 5.5, 1.5)
    const yaw = facing(px, pz, grub.x, grub.z)
    const arsenal = createArsenal()

    let shots = 0
    let hits = 0
    let t = 0
    while (isAlive(grub.mind) && t < 20) {
      const result = fire(arsenal, rng)
      if (result.fired) {
        shots++
        for (const offset of result.angles!) {
          const raw = aimDirection(yaw + offset, 0)
          const targets = targetable([grub]).map((e) => ({
            target: e,
            cylinder: enemyCylinder(e, s, level.wallHeight),
          }))
          // Vertical assist, as the game does: a Grub is knee-high and a level
          // shot would otherwise pass over it.
          const dir = verticalAutoAim(
            px * s,
            eyeY,
            pz * s,
            raw.x,
            raw.y,
            raw.z,
            targets,
            40 * s,
            AUTOAIM_CONE,
          )
          const hit = nearestHit(px * s, eyeY, pz * s, dir.x, dir.y, dir.z, targets, 40 * s)
          if (hit) {
            hits++
            damage(
              hit.target.mind,
              hit.target.def,
              damageAtRange(definition(arsenal), hit.distance / s),
              rng,
            )
          }
        }
      }
      tickArsenal(arsenal, STEP)
      updateEnemy(grub, level, px, pz, STEP)
      t += STEP
    }

    expect(isAlive(grub.mind)).toBe(false)
    expect(hits).toBeGreaterThan(0)
    // 15 hp against 12 damage falling off with range: two or three shots.
    expect(shots).toBeGreaterThanOrEqual(2)
    expect(shots).toBeLessThanOrEqual(6)
  })

  it('cannot shoot an enemy through a wall', () => {
    // The wall distance is what enforces this. Without it a player clears
    // rooms they have not entered, which is invisible until someone notices.
    const target = spawnEnemy('grub', 15.5, 12.5)
    const yaw = facing(1.5, 1.5, target.x, target.z)
    const dir = aimDirection(yaw, 0)
    const candidates = [{ target, cylinder: enemyCylinder(target, s, level.wallHeight) }]
    // A wall three cells away blocks it; unlimited range would not.
    expect(nearestHit(1.5 * s, eyeY, 1.5 * s, dir.x, dir.y, dir.z, candidates, 3 * s)).toBeNull()
  })

  it('does not hit a corpse that is soaking up shots for its friends', () => {
    const dead = spawnEnemy('grub', 5.5, 1.5)
    damage(dead.mind, dead.def, 999, () => 1)
    expect(targetable([dead])).toHaveLength(0)
  })
})

describe('an enemy hunting the player', () => {
  it('closes the distance and lands a strike', () => {
    const grub = spawnEnemy('grub', 8.5, 1.5)
    const [px, pz] = [1.5, 1.5]
    let strikes = 0
    let t = 0
    while (t < 12) {
      updateEnemy(grub, level, px, pz, STEP)
      if (grub.mind.didStrike) strikes++
      t += STEP
    }
    expect(Math.hypot(grub.x - px, grub.z - pz)).toBeLessThanOrEqual(grub.def.attackRange + 0.2)
    expect(strikes).toBeGreaterThan(0)
  })

  it('never ends up inside a wall while chasing, from anywhere on the map', () => {
    // Enemies use the same swept collision as the player. Giving them a
    // simpler mover is the usual way they end up embedded in geometry -- and
    // the first version of this test started them somewhere whose straight line
    // to the player crossed no walls, so a naive mover passed it. These starts
    // are chosen so the beeline definitely goes through solid rock.
    // Derived from the level rather than hand-picked: my first attempt at this
    // list put a start inside the secret wall, and another where the beeline
    // was clear so a naive mover passed. Deriving them means neither can happen
    // again as the map changes.
    const obstructed = level.cells.filter(
      (c) => (c.floor ?? c.exit) && !hasLineOfSight(level, c.x + 0.5, c.z + 0.5, 1.5, 1.5),
    )
    expect(obstructed.length).toBeGreaterThan(10)

    // Every eleventh, to keep the test quick while still spanning the map.
    const starts: [number, number][] = obstructed
      .filter((_, i) => i % 11 === 0)
      .map((c) => [c.x + 0.5, c.z + 0.5])

    for (const [sx, sz] of starts) {
      const grub = spawnEnemy('grub', sx, sz)
      // Force it into chase. These starts have no line of sight by
      // construction, so left alone the grub stays idle and never moves --
      // which made the first version of this test pass a naive mover simply by
      // never exercising the mover at all.
      grub.mind.state = 'chase'
      grub.mind.provoked = true
      // Prove the direct path is actually obstructed, or this asserts nothing.
      expect(
        hasLineOfSight(level, sx, sz, 1.5, 1.5),
        `start ${sx},${sz} has clear line of sight -- pick an obstructed one`,
      ).toBe(false)

      for (let t = 0; t < 12; t += STEP) {
        updateEnemy(grub, level, 1.5, 1.5, STEP)
        const cell = level.cells[Math.floor(grub.z) * level.width + Math.floor(grub.x)]
        expect(
          cell?.floor ?? cell?.exit,
          `from ${sx},${sz} ended at ${grub.x.toFixed(2)},${grub.z.toFixed(2)}`,
        ).toBeTruthy()
      }
    }
  })

  it('stays idle when the player is far away and out of sight', () => {
    const grub = spawnEnemy('grub', 15.5, 12.5)
    for (let t = 0; t < 3; t += STEP) updateEnemy(grub, level, 1.5, 1.5, STEP)
    expect(grub.mind.state).toBe('idle')
  })

  it('notices a player standing in the open in front of it', () => {
    const grub = spawnEnemy('grub', 5.5, 1.5)
    grub.facing = facing(grub.x, grub.z, 1.5, 1.5)
    for (let t = 0; t < 1; t += STEP) updateEnemy(grub, level, 1.5, 1.5, STEP)
    expect(grub.mind.state).not.toBe('idle')
  })
})

describe('death burst', () => {
  const bloat = {
    ...ENEMIES.grub,
    id: 'bloat',
    deathBurst: { damage: 40, radius: 2.5 },
  }

  const freshlyDead = () => {
    const enemy = { ...spawnEnemy('grub', 5, 5), def: bloat }
    enemy.mind.justDied = true
    return enemy
  }

  it('does nothing for a slug that carries no burst', () => {
    const plain = spawnEnemy('grub', 5, 5)
    plain.mind.justDied = true
    expect(burstDamage(plain, 5, 5)).toBe(0)
  })

  it('does nothing on any tick but the one it dies on', () => {
    // `justDied` is a one-tick flag. Without the guard the corpse keeps
    // detonating every frame for as long as the player stands near it.
    const enemy = freshlyDead()
    enemy.mind.justDied = false
    expect(burstDamage(enemy, 5, 5)).toBe(0)
  })

  it('hits hardest at the centre', () => {
    expect(burstDamage(freshlyDead(), 5, 5)).toBe(40)
  })

  it('falls off to nothing at the rim rather than stopping dead', () => {
    // A flat blast makes the radius a cliff, and a cliff nobody can see is
    // indistinguishable from a bug.
    const near = burstDamage(freshlyDead(), 5 + 0.5, 5)
    const far = burstDamage(freshlyDead(), 5 + 2.0, 5)
    expect(near).toBeGreaterThan(far)
    expect(far).toBeGreaterThan(0)
    expect(burstDamage(freshlyDead(), 5 + bloat.deathBurst.radius, 5)).toBe(0)
    expect(burstDamage(freshlyDead(), 5 + bloat.deathBurst.radius + 1, 5)).toBe(0)
  })

  it('measures from the slug, not from an axis', () => {
    // Diagonal distance, so a burst cannot be a square dressed up as a circle.
    const diagonal = burstDamage(freshlyDead(), 5 + 1.8, 5 + 1.8)
    expect(diagonal, 'a corner 2.55 away is outside a 2.5 radius').toBe(0)
  })
})

describe('directional armour', () => {
  const shellback = ENEMIES.shellback

  /** A Shellback at the origin, facing whichever way is asked for. */
  const looking = (yaw: number) => {
    const enemy = spawnEnemy('shellback', 5, 5)
    enemy.facing = yaw
    return enemy
  }

  /** Yaw that looks toward (dx, dz). Forward is (-sin yaw, -cos yaw). */
  const toward = (dx: number, dz: number) => Math.atan2(-dx, -dz)

  it('lets everything through for a slug with no plating', () => {
    expect(armourScale(spawnEnemy('grub', 5, 5), 9, 5)).toBe(1)
    expect(ENEMIES.grub.armour).toBeNull()
  })

  it('soaks a shot taken head-on', () => {
    // Looking east, shot from the east.
    expect(armourScale(looking(toward(1, 0)), 9, 5)).toBe(shellback.armour!.multiplier)
  })

  it('lets a shot from behind through in full', () => {
    expect(armourScale(looking(toward(1, 0)), 1, 5)).toBe(1)
  })

  it('protects the side it is looking at, whichever way that is', () => {
    // The plating and the sight cone face the same way on purpose: its blind
    // spot and its soft spot are the same place, so one move solves both.
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const enemy = looking(toward(dx, dz))
      const front = armourScale(enemy, 5 + dx * 4, 5 + dz * 4)
      const back = armourScale(enemy, 5 - dx * 4, 5 - dz * 4)
      expect(front, `facing ${dx},${dz} from the front`).toBeLessThan(1)
      expect(back, `facing ${dx},${dz} from behind`).toBe(1)
    }
  })

  it('turns over at the edge of its own arc', () => {
    const enemy = looking(0) // looking toward -z
    const arc = shellback.armour!.arc
    const at = (angle: number) =>
      armourScale(enemy, 5 - Math.sin(angle) * 4, 5 - Math.cos(angle) * 4)

    expect(at(arc - 0.05), 'just inside the plating').toBeLessThan(1)
    expect(at(arc + 0.05), 'just outside it').toBe(1)
  })

  it('gives a wide enough arc that walking round it is the answer', () => {
    // A narrow arc makes strafing a few degrees the answer and the creature
    // stops asking anything of the player.
    expect(shellback.armour!.arc).toBeGreaterThan(1)
    expect(shellback.armour!.multiplier).toBeLessThan(0.25)
  })

  it('does not depend on how far away the shooter is', () => {
    const enemy = looking(toward(1, 0))
    expect(armourScale(enemy, 5.5, 5)).toBe(armourScale(enemy, 25, 5))
  })
})
