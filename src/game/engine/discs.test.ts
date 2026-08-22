import { describe, expect, it } from 'vitest'
import { overlapsDisc, pushOutOfDiscs, slideAlongDiscs, type Disc } from './collision.ts'
import { isSolid, parseLevel } from '../world/level.ts'
import e1m1 from '../world/levels/e1m1.ts'

const level = parseLevel(e1m1)
const R = 0.28

describe('overlapsDisc', () => {
  const discs: Disc[] = [{ x: 5, z: 5, radius: 0.3 }]

  it('detects an overlap', () => {
    expect(overlapsDisc(5.4, 5, R, discs)).toBe(true)
  })

  it('allows touching without overlapping', () => {
    expect(overlapsDisc(5 + 0.3 + R + 1e-6, 5, R, discs)).toBe(false)
  })

  it('is false with no discs', () => {
    expect(overlapsDisc(5, 5, R, [])).toBe(false)
  })
})

describe('slideAlongDiscs', () => {
  const slug: Disc[] = [{ x: 5, z: 5, radius: 0.3 }]

  it('lets a clear move through untouched', () => {
    const r = slideAlongDiscs(1, 1, 1.2, 1, R, slug)
    expect(r).toEqual({ x: 1.2, z: 1, blocked: false })
  })

  it('stops a head-on approach short of the slug', () => {
    const r = slideAlongDiscs(4, 5, 5, 5, R, slug)
    expect(r.blocked).toBe(true)
    expect(overlapsDisc(r.x, r.z, R, slug)).toBe(false)
  })

  it('slides along rather than stopping dead on a glancing approach', () => {
    // Moving mostly along z with a small push into the slug: the z component
    // should survive.
    const r = slideAlongDiscs(4.4, 4, 4.5, 4.9, R, slug)
    expect(r.blocked).toBe(true)
    expect(r.z).toBeGreaterThan(4)
    expect(overlapsDisc(r.x, r.z, R, slug)).toBe(false)
  })

  it('never leaves the mover overlapping, from any approach angle', () => {
    for (let angle = 0; angle < Math.PI * 2; angle += 0.15) {
      const fromX = 5 + Math.cos(angle) * 1.5
      const fromZ = 5 + Math.sin(angle) * 1.5
      const toX = 5 + Math.cos(angle) * 0.1
      const toZ = 5 + Math.sin(angle) * 0.1
      const r = slideAlongDiscs(fromX, fromZ, toX, toZ, R, slug)
      expect(overlapsDisc(r.x, r.z, R, slug), `angle ${angle.toFixed(2)}`).toBe(false)
    }
  })

  it('lets a mover already inside a disc keep moving instead of trapping it', () => {
    // A slug can walk onto the player. Refusing the move would pin the player
    // inside it until the slug wandered off.
    const r = slideAlongDiscs(5, 5, 5.1, 5, R, slug)
    expect(r.blocked).toBe(false)
    expect(r.x).toBe(5.1)
  })

  it('is a no-op with no discs', () => {
    expect(slideAlongDiscs(1, 1, 2, 2, R, [])).toEqual({ x: 2, z: 2, blocked: false })
  })
})

describe('pushOutOfDiscs', () => {
  it('moves a body clear of one it is standing in', () => {
    const player: Disc[] = [{ x: 5.5, z: 1.5, radius: R }]
    const r = pushOutOfDiscs(level, 5.5, 1.5, 0.3, player)
    expect(Math.hypot(r.x - 5.5, r.z - 1.5)).toBeGreaterThan(0)
    expect(overlapsDisc(r.x, r.z, 0.3, player)).toBe(false)
  })

  it('is deterministic when exactly coincident', () => {
    const player: Disc[] = [{ x: 5.5, z: 1.5, radius: R }]
    const a = pushOutOfDiscs(level, 5.5, 1.5, 0.3, player)
    const b = pushOutOfDiscs(level, 5.5, 1.5, 0.3, player)
    expect(a).toEqual(b)
  })

  it('never pushes a body into a wall', () => {
    // Cornered against geometry with the player pressing in: the slug must not
    // be squeezed through the wall behind it.
    for (let angle = 0; angle < Math.PI * 2; angle += 0.2) {
      const px = 1.5 + Math.cos(angle) * 0.2
      const pz = 1.5 + Math.sin(angle) * 0.2
      const r = pushOutOfDiscs(level, 1.5, 1.5, 0.3, [{ x: px, z: pz, radius: R }])
      expect(isSolid(level, Math.floor(r.x), Math.floor(r.z)), `${r.x},${r.z}`).toBe(false)
    }
  })

  it('leaves a body that overlaps nothing where it is', () => {
    const r = pushOutOfDiscs(level, 5.5, 1.5, 0.3, [{ x: 9.5, z: 1.5, radius: R }])
    expect(r).toEqual({ x: 5.5, z: 1.5 })
  })
})
