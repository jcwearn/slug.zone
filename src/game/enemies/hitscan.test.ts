import { describe, expect, it } from 'vitest'
import { nearestHit, rayCylinder, verticalAutoAim, type Cylinder } from './hitscan.ts'

const cyl = (x: number, z: number, radius = 0.5, yMin = 0, yMax = 2): Cylinder => ({
  x,
  z,
  radius,
  yMin,
  yMax,
})

describe('rayCylinder', () => {
  it('hits a cylinder straight ahead at the near surface', () => {
    const t = rayCylinder(0, 1, 0, 0, 0, 1, cyl(0, 5), 50)
    expect(t).toBeCloseTo(4.5, 9)
  })

  it('misses when the ray passes to one side', () => {
    expect(rayCylinder(0, 1, 0, 0, 0, 1, cyl(3, 5), 50)).toBeNull()
  })

  it('misses when the ray passes over the top', () => {
    // Height matters: a sphere would make a short creature hittable above its
    // head, which is the reason this is a cylinder.
    expect(rayCylinder(0, 5, 0, 0, 0, 1, cyl(0, 5, 0.5, 0, 2), 50)).toBeNull()
  })

  it('misses when the ray passes under the base', () => {
    expect(rayCylinder(0, 1, 0, 0, 0, 1, cyl(0, 5, 0.5, 3, 5), 50)).toBeNull()
  })

  it('hits a tall cylinder the same ray missed when short', () => {
    expect(rayCylinder(0, 3, 0, 0, 0, 1, cyl(0, 5, 0.5, 0, 2), 50)).toBeNull()
    expect(rayCylinder(0, 3, 0, 0, 0, 1, cyl(0, 5, 0.5, 0, 4), 50)).toBeCloseTo(4.5, 9)
  })

  it('respects the max distance', () => {
    expect(rayCylinder(0, 1, 0, 0, 0, 1, cyl(0, 20), 5)).toBeNull()
  })

  it('grazes the exact tangent without producing NaN', () => {
    const t = rayCylinder(0.5, 1, 0, 0, 0, 1, cyl(0, 5, 0.5), 50)
    if (t !== null) expect(Number.isFinite(t)).toBe(true)
  })

  it('hits from inside the cylinder, using the far root', () => {
    // Happens whenever an enemy is pressed against the player.
    const t = rayCylinder(0, 1, 5, 0, 0, 1, cyl(0, 5, 0.5), 50)
    expect(t).not.toBeNull()
    expect(t!).toBeGreaterThanOrEqual(0)
  })

  it('handles a perfectly vertical ray without dividing by zero', () => {
    // a is zero here; an unguarded quadratic gives NaN and every comparison
    // against NaN is false, so it would silently report a miss.
    const t = rayCylinder(0, 0.5, 0, 0, 1, 0, cyl(0, 0, 0.5, 1, 3), 50)
    expect(t).toBeCloseTo(0.5, 9)
    expect(Number.isNaN(t!)).toBe(false)
  })

  it('misses a vertical ray outside the circle', () => {
    expect(rayCylinder(9, 0.5, 0, 0, 1, 0, cyl(0, 0, 0.5, 1, 3), 50)).toBeNull()
  })

  it('handles a downward vertical ray', () => {
    const t = rayCylinder(0, 5, 0, 0, -1, 0, cyl(0, 0, 0.5, 0, 2), 50)
    expect(t).toBeCloseTo(3, 9)
  })

  it('never returns a negative distance', () => {
    for (let angle = 0; angle < Math.PI * 2; angle += 0.2) {
      const t = rayCylinder(0, 1, 0, Math.cos(angle), 0, Math.sin(angle), cyl(2, 2, 0.6), 50)
      if (t !== null) expect(t).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('nearestHit', () => {
  const candidates = [
    { target: 'far', cylinder: cyl(0, 12) },
    { target: 'near', cylinder: cyl(0, 4) },
    { target: 'aside', cylinder: cyl(6, 4) },
  ]

  it('picks the closest of several along the ray', () => {
    const hit = nearestHit(0, 1, 0, 0, 0, 1, candidates, 50)
    expect(hit?.target).toBe('near')
  })

  it('returns null when nothing is in the way', () => {
    expect(nearestHit(0, 1, 0, 1, 0, 0, candidates, 50)).toBeNull()
  })

  it('ignores anything past the wall, so shots do not kill through walls', () => {
    // The most obvious possible hitscan bug, and invisible until someone
    // notices they are clearing rooms they have not entered.
    expect(nearestHit(0, 1, 0, 0, 0, 1, candidates, 3)?.target).toBeUndefined()
    expect(nearestHit(0, 1, 0, 0, 0, 1, candidates, 5)?.target).toBe('near')
    expect(nearestHit(0, 1, 0, 0, 0, 1, candidates, 13)?.target).toBe('near')
  })

  it('handles an empty candidate list', () => {
    expect(nearestHit(0, 1, 0, 0, 0, 1, [], 50)).toBeNull()
  })
})

describe('verticalAutoAim', () => {
  // The real numbers from E1M1: eye at 2.2, a Grub topping out at 1.4.
  const EYE = 2.2
  const grub = cyl(0, 16, 1.2, 0, 1.4)
  const candidates = [{ target: 'grub', cylinder: grub }]

  it('lowers a level shot onto a target it would otherwise sail over', () => {
    const before = { x: 0, y: 0, z: 1 }
    expect(rayCylinder(0, EYE, 0, before.x, before.y, before.z, grub, 100)).toBeNull()

    const after = verticalAutoAim(0, EYE, 0, before.x, before.y, before.z, candidates, 100, 0.25)
    expect(after.y).toBeLessThan(0)
    expect(rayCylinder(0, EYE, 0, after.x, after.y, after.z, grub, 100)).not.toBeNull()
  })

  it('leaves the horizontal heading exactly alone, so spread still matters', () => {
    const yaw = 0.3
    const before = { x: Math.sin(yaw), y: 0, z: Math.cos(yaw) }
    const after = verticalAutoAim(0, EYE, 0, before.x, before.y, before.z, candidates, 100, 0.9)
    const beforeHeading = Math.atan2(before.x, before.z)
    const afterHeading = Math.atan2(after.x, after.z)
    expect(afterHeading).toBeCloseTo(beforeHeading, 9)
  })

  it('returns a unit vector', () => {
    const after = verticalAutoAim(0, EYE, 0, 0, 0, 1, candidates, 100, 0.25)
    expect(Math.hypot(after.x, after.y, after.z)).toBeCloseTo(1, 9)
  })

  it('does not assist a shot aimed deliberately at the ceiling', () => {
    // The cone is a full 3D angle for exactly this reason: a horizontal-only
    // cone would still snap onto the slug at your feet while you aim upward.
    const up = { x: 0, y: 0.9, z: 0.44 }
    const after = verticalAutoAim(0, EYE, 0, up.x, up.y, up.z, candidates, 100, 0.25)
    expect(after).toEqual(up)
  })

  it('does not assist a target outside the cone horizontally', () => {
    const away = { x: 1, y: 0, z: 0 }
    const after = verticalAutoAim(0, EYE, 0, away.x, away.y, away.z, candidates, 100, 0.25)
    expect(after).toEqual(away)
  })

  it('ignores targets past the max distance', () => {
    const level = { x: 0, y: 0, z: 1 }
    const after = verticalAutoAim(0, EYE, 0, level.x, level.y, level.z, candidates, 5, 0.25)
    expect(after).toEqual(level)
  })

  it('picks the nearest of two targets at different heights', () => {
    const near = cyl(0, 6, 1.2, 0, 1.4)
    const far = cyl(0, 30, 1.2, 3, 4)
    const after = verticalAutoAim(
      0,
      EYE,
      0,
      0,
      0,
      1,
      [
        { target: 'far', cylinder: far },
        { target: 'near', cylinder: near },
      ],
      100,
      0.6,
    )
    // Aimed down at the near one, not up at the far one.
    expect(after.y).toBeLessThan(0)
  })

  it('leaves a straight-up shot untouched rather than dividing by zero', () => {
    const straightUp = { x: 0, y: 1, z: 0 }
    const after = verticalAutoAim(0, EYE, 0, 0, 1, 0, candidates, 100, 3)
    expect(after).toEqual(straightUp)
  })

  it('is a no-op with no candidates', () => {
    const d = { x: 0, y: 0, z: 1 }
    expect(verticalAutoAim(0, EYE, 0, d.x, d.y, d.z, [], 100, 0.25)).toEqual(d)
  })
})
