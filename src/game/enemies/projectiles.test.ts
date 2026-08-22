import { describe, expect, it } from 'vitest'
import { Globs } from './projectiles.ts'
import { parseLevel } from '../world/level.ts'
import { PLAYER_RADIUS } from '../engine/collision.ts'
import { ENEMIES } from './definitions.ts'
import e1m1 from '../world/levels/e1m1.ts'

const level = parseLevel(e1m1)
const ROOM = level.wallHeight
const STEP = 1 / 60
const SPEED = ENEMIES.spitter.projectile!.speed
/** The player's body, as the game passes it: floor to a little above the eye. */
const EYE = 0.55 * ROOM
const P_BOTTOM = 0
const P_TOP = EYE + 0.25

/** Run until every glob has resolved, collecting what happened. */
function fly(
  globs: Globs,
  playerX: number,
  playerZ: number,
  seconds = 5,
): ReturnType<Globs['step']> {
  const all: ReturnType<Globs['step']> = []
  for (let t = 0; t < seconds && globs.activeCount > 0; t += STEP) {
    all.push(...globs.step(level, STEP, playerX, playerZ, PLAYER_RADIUS, ROOM, P_BOTTOM, P_TOP))
  }
  return all
}

describe('spawn', () => {
  it('launches toward the target', () => {
    const globs = new Globs()
    const glob = globs.spawn(4.5, 1.5, 1.4, 8.5, 1.5, 1.8, SPEED, 11)!
    expect(glob.active).toBe(true)
    expect(glob.vx).toBeGreaterThan(0)
    expect(Math.abs(glob.vz)).toBeCloseTo(0, 6)
  })

  it('refuses a zero-length shot rather than producing NaN velocities', () => {
    const globs = new Globs()
    expect(globs.spawn(4.5, 1.5, 1, 4.5, 1.5, 1, SPEED, 11)).toBeNull()
  })

  it('arcs so it arrives at the target height, not below it', () => {
    // Asserted on the trajectory, not on whether it connects. The player's
    // hitbox runs from the floor to above the head, so a glob that drops to
    // knee height still hits -- which means a hit test cannot tell a
    // compensated launch from a flat one. The arc is about what it LOOKS like
    // in flight, so the height it arrives at is the actual claim.
    const globs = new Globs()
    const targetZ = 1.5
    const targetY = 1.85
    const glob = globs.spawn(1.5, 5.5, 2.0, 1.5, targetZ, targetY, SPEED, 11)!

    let arrivalY = Number.NaN
    for (let t = 0; t < 5; t += STEP) {
      const wasAbove = glob.z > targetZ
      globs.step(level, STEP, 99, 99, PLAYER_RADIUS, ROOM, P_BOTTOM, P_TOP)
      if (wasAbove && glob.z <= targetZ) {
        arrivalY = glob.worldY
        break
      }
    }

    expect(Number.isNaN(arrivalY)).toBe(false)
    expect(arrivalY).toBeCloseTo(targetY, 1)
  })
})

describe('hitting the player', () => {
  it('hits a player who stands still', () => {
    const globs = new Globs()
    globs.spawn(1.5, 5.5, 2.0, 1.5, 1.5, 1.85, SPEED, 11)
    const outcomes = fly(globs, 1.5, 1.5)
    const hit = outcomes.find((o) => o.kind === 'hit')
    expect(hit).toBeDefined()
    expect(hit && hit.kind === 'hit' && hit.damage).toBe(11)
  })

  it('misses a player who moves after it is fired', () => {
    // The whole reason the attack is a visible travelling object: it is aimed
    // where you WERE, so stepping aside is what saves you.
    const globs = new Globs()
    globs.spawn(1.5, 5.5, 2.0, 1.5, 1.5, 1.85, SPEED, 11)

    let px = 1.5
    const outcomes: ReturnType<Globs['step']> = []
    for (let t = 0; t < 5 && globs.activeCount > 0; t += STEP) {
      px = Math.min(3.2, px + 4 * STEP)
      outcomes.push(...globs.step(level, STEP, px, 1.5, PLAYER_RADIUS, ROOM, P_BOTTOM, P_TOP))
    }
    expect(outcomes.some((o) => o.kind === 'hit')).toBe(false)
  })

  it('resolves as a hit rather than a wall splash when the player is against one', () => {
    // Checking geometry first would let the glob resolve into the wall on the
    // same tick it reaches you, and the shot that hit you would splash
    // harmlessly instead.
    const globs = new Globs()
    globs.spawn(5.5, 1.5, 1.4, 1.35, 1.5, 1.85, SPEED, 11)
    const outcomes = fly(globs, 1.35, 1.5)
    expect(outcomes.some((o) => o.kind === 'hit')).toBe(true)
  })
})

describe('stopping', () => {
  it('splashes on a wall instead of passing through it', () => {
    // Asserting only that SOMETHING reported 'wall' is worthless: with the
    // geometry check removed the glob simply flies on and reports 'wall' when
    // it hits the floor instead. Where it stopped is the actual claim.
    // Fired dead level down the top corridor, so the only thing that can stop
    // it is the wall at the end. Letting it arc means it hits the ceiling
    // first and reports 'wall' regardless -- which is how the first version of
    // this passed with the geometry check removed entirely.
    const globs = new Globs()
    // Fired from close to the wall on purpose. From the far end of the
    // corridor gravity brings it to the floor at almost exactly the wall's x,
    // so "stopped by the wall" and "landed" become indistinguishable.
    const glob = globs.spawn(7.5, 1.5, 2.0, 30, 1.5, 2.0, SPEED, 11)!
    glob.vWorldY = 0
    let stoppedAtX = Number.NaN
    let stoppedAtY = Number.NaN
    for (let t = 0; t < 10 && globs.activeCount > 0; t += STEP) {
      for (const o of globs.step(level, STEP, 99, 99, PLAYER_RADIUS, ROOM, P_BOTTOM, P_TOP)) {
        if (o.kind === 'wall') {
          stoppedAtX = o.x
          stoppedAtY = o.worldY
        }
      }
    }

    // Row 1 is open from x=1 to x=8 and walled at x=9, so a level shot down
    // it stops there -- not at the far side of the map.
    expect(Number.isNaN(stoppedAtX)).toBe(false)
    expect(stoppedAtX).toBeGreaterThan(8)
    expect(stoppedAtX).toBeLessThan(10)

    // And still well off the floor. Without the geometry check the glob simply
    // falls, and gravity happens to put it down at almost exactly the same x --
    // so position alone cannot tell "stopped by a wall" from "landed".
    expect(stoppedAtY).toBeGreaterThan(1)
    expect(globs.activeCount).toBe(0)
  })

  it('does not hit a player it sails clean over', () => {
    // The hit test used to be purely horizontal, so a glob at ceiling height
    // still hit you -- and that also made the launch arc irrelevant, since a
    // shot landing at your feet counted the same as one at your chest.
    const globs = new Globs()
    const glob = globs.spawn(5.5, 1.5, 3.5, 1.5, 1.5, 3.5, SPEED, 11)!
    glob.vWorldY = 0
    const outcomes = fly(globs, 1.5, 1.5)
    expect(outcomes.some((o) => o.kind === 'hit')).toBe(false)
  })

  it('never leaves a glob inside solid geometry', () => {
    const globs = new Globs()
    for (const [tx, tz] of [
      [18.5, 1.5],
      [1.5, 15.5],
      [8.5, 8.5],
    ] as const) {
      globs.spawn(4.5, 1.5, 1.6, tx, tz, 1.6, SPEED, 11)
    }
    for (let t = 0; t < 10 && globs.activeCount > 0; t += STEP) {
      globs.step(level, STEP, 30, 30, PLAYER_RADIUS, ROOM, P_BOTTOM, P_TOP)
    }
    expect(globs.activeCount).toBe(0)
  })

  it('fizzles out rather than flying forever', () => {
    const globs = new Globs()
    globs.spawn(9.5, 9.5, 2, 9.6, 9.5, 2, SPEED, 11)
    for (let t = 0; t < 30 && globs.activeCount > 0; t += STEP) {
      globs.step(level, STEP, 30, 30, PLAYER_RADIUS, ROOM, P_BOTTOM, P_TOP)
    }
    expect(globs.activeCount).toBe(0)
  })

  it('stops at the floor and the ceiling', () => {
    const globs = new Globs()
    const glob = globs.spawn(9.5, 9.5, 2, 12.5, 9.5, 2, SPEED, 11)!
    glob.vWorldY = -40
    const outcomes = fly(globs, 30, 30)
    expect(outcomes.some((o) => o.kind === 'wall')).toBe(true)
  })
})

describe('the pool', () => {
  it('reuses slots rather than growing without bound', () => {
    const globs = new Globs()
    const size = globs.items.length
    for (let i = 0; i < size * 3; i++) globs.spawn(9.5, 9.5, 2, 12.5, 9.5, 2, SPEED, 5)
    expect(globs.items.length).toBe(size)
    expect(globs.activeCount).toBeLessThanOrEqual(size)
  })

  it('clears everything on restart', () => {
    const globs = new Globs()
    globs.spawn(9.5, 9.5, 2, 12.5, 9.5, 2, SPEED, 5)
    globs.clear()
    expect(globs.activeCount).toBe(0)
  })
})
