import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { aimDirection, shotEndpoint } from './aim.ts'

const YAWS = [0, 0.4, Math.PI / 2, 2.2, Math.PI, -1.1, 5.3]
const PITCHES = [-1.4, -0.7, -0.2, 0, 0.2, 0.7, 1.4]

function cameraForward(yaw: number, pitch: number) {
  const cam = new THREE.PerspectiveCamera()
  cam.rotation.set(pitch, yaw, 0, 'YXZ')
  cam.updateMatrixWorld(true)
  const v = new THREE.Vector3()
  cam.getWorldDirection(v)
  return v
}

describe('aimDirection', () => {
  it('matches the three.js camera forward vector at every yaw and pitch', () => {
    for (const yaw of YAWS) {
      for (const pitch of PITCHES) {
        const want = cameraForward(yaw, pitch)
        const got = aimDirection(yaw, pitch)
        expect(got.x, `x at yaw=${yaw} pitch=${pitch}`).toBeCloseTo(want.x, 9)
        expect(got.y, `y at yaw=${yaw} pitch=${pitch}`).toBeCloseTo(want.y, 9)
        expect(got.z, `z at yaw=${yaw} pitch=${pitch}`).toBeCloseTo(want.z, 9)
      }
    }
  })

  it('points UP for positive pitch', () => {
    // The exact bug this module replaced: the tracer term was negated, so
    // aiming up sent salt into the floor.
    expect(aimDirection(0, 0.5).y).toBeGreaterThan(0)
    expect(aimDirection(0, -0.5).y).toBeLessThan(0)
  })

  it('is level at zero pitch', () => {
    for (const yaw of YAWS) expect(aimDirection(yaw, 0).y).toBeCloseTo(0, 12)
  })

  it('is always unit length', () => {
    for (const yaw of YAWS) {
      for (const pitch of PITCHES) {
        const d = aimDirection(yaw, pitch)
        expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 9)
      }
    }
  })

  it('keeps the horizontal heading unchanged as pitch varies', () => {
    // Pitching up must not swing your aim sideways.
    for (const yaw of YAWS) {
      const level = aimDirection(yaw, 0)
      for (const pitch of PITCHES) {
        const d = aimDirection(yaw, pitch)
        const h = Math.hypot(d.x, d.z)
        if (h < 1e-9) continue
        expect(d.x / h).toBeCloseTo(level.x, 6)
        expect(d.z / h).toBeCloseTo(level.z, 6)
      }
    }
  })
})

describe('shotEndpoint', () => {
  const EYE = 2.2
  const FLOOR = 0
  const CEIL = 4

  it('stops at the wall when aiming level', () => {
    const r = shotEndpoint(EYE, aimDirection(0, 0), 10, 40, FLOOR, CEIL)
    expect(r.stoppedBy).toBe('wall')
    expect(r.distance).toBeCloseTo(10, 9)
  })

  it('converts horizontal wall distance to distance along a pitched ray', () => {
    // Forgetting the cos(pitch) divide makes shots fall short by more and more
    // as you look up, which reads as the gun being inaccurate.
    const pitch = 0.4
    const r = shotEndpoint(EYE, aimDirection(0, pitch), 1, 40, FLOOR, 999)
    expect(r.distance).toBeCloseTo(1 / Math.cos(pitch), 9)
    expect(r.distance).toBeGreaterThan(1)
  })

  it('stops at the ceiling when the ceiling comes first', () => {
    const r = shotEndpoint(EYE, aimDirection(0, 1.2), 50, 40, FLOOR, CEIL)
    expect(r.stoppedBy).toBe('ceiling')
    const end = EYE + aimDirection(0, 1.2).y * r.distance
    expect(end).toBeCloseTo(CEIL, 9)
  })

  it('stops at the floor when aiming down', () => {
    const r = shotEndpoint(EYE, aimDirection(0, -1.2), 50, 40, FLOOR, CEIL)
    expect(r.stoppedBy).toBe('floor')
    const end = EYE + aimDirection(0, -1.2).y * r.distance
    expect(end).toBeCloseTo(FLOOR, 9)
  })

  it('handles straight up, where there is no horizontal component', () => {
    // cosPitch is 0 here, so the wall distance is meaningless and dividing by
    // it would produce Infinity.
    const r = shotEndpoint(EYE, { x: 0, y: 1, z: 0 }, 3, 40, FLOOR, CEIL)
    expect(r.stoppedBy).toBe('ceiling')
    expect(r.distance).toBeCloseTo(CEIL - EYE, 9)
    expect(Number.isFinite(r.distance)).toBe(true)
  })

  it('handles straight down', () => {
    const r = shotEndpoint(EYE, { x: 0, y: -1, z: 0 }, 3, 40, FLOOR, CEIL)
    expect(r.stoppedBy).toBe('floor')
    expect(r.distance).toBeCloseTo(EYE - FLOOR, 9)
  })

  it('falls back to max range in open space', () => {
    const r = shotEndpoint(EYE, aimDirection(0, 0), Infinity, 40, FLOOR, 999)
    expect(r.stoppedBy).toBe('range')
    expect(r.distance).toBe(40)
  })

  it('rejects an eye outside the room, which is what a unit mismatch looks like', () => {
    // The bug this guards: X and Z are world units (grid * cellSize) while Y is
    // not. Scaling Y as well put the muzzle at 8.8 in a room 4 tall, so every
    // grain spawned above the ceiling and nothing was visible on screen. The
    // maths itself stayed perfectly consistent -- only the units were wrong,
    // which is exactly the class of error no amount of trig checking catches.
    expect(() => shotEndpoint(8.8, aimDirection(0, 0), 10, 40, 0, 4)).toThrow(RangeError)
    expect(() => shotEndpoint(8.8, aimDirection(0, 0), 10, 40, 0, 4)).toThrow(/outside the room/)
    expect(() => shotEndpoint(-1, aimDirection(0, 0), 10, 40, 0, 4)).toThrow(RangeError)
  })

  it('accepts an eye exactly on the floor or ceiling', () => {
    expect(() => shotEndpoint(0, aimDirection(0, 0), 10, 40, 0, 4)).not.toThrow()
    expect(() => shotEndpoint(4, aimDirection(0, 0), 10, 40, 0, 4)).not.toThrow()
  })

  it('never returns a negative distance', () => {
    for (const pitch of PITCHES) {
      for (const wall of [0, 0.5, 5, 100]) {
        const r = shotEndpoint(EYE, aimDirection(1.1, pitch), wall, 40, FLOOR, CEIL)
        expect(r.distance).toBeGreaterThanOrEqual(0)
        expect(Number.isFinite(r.distance)).toBe(true)
      }
    }
  })

  it('always ends inside the room, never through a surface', () => {
    for (const pitch of PITCHES) {
      const dir = aimDirection(0.7, pitch)
      const r = shotEndpoint(EYE, dir, 6, 40, FLOOR, CEIL)
      const endY = EYE + dir.y * r.distance
      expect(endY, `pitch ${pitch}`).toBeGreaterThanOrEqual(FLOOR - 1e-6)
      expect(endY, `pitch ${pitch}`).toBeLessThanOrEqual(CEIL + 1e-6)
    }
  })
})
