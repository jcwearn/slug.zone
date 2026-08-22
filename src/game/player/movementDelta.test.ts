import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { movementDelta } from './controller.ts'
import { moveVector, type Action } from '../engine/input.ts'

/**
 * These assert against three.js's OWN camera basis rather than a second
 * derivation of it. A hand-written expectation can be wrong in exactly the
 * same way the implementation is wrong -- which is how the original bug
 * survived: the comment said "forward is -z" and the code negated neither
 * term, and nothing compared the two.
 */
const YAWS = [0, 0.3, Math.PI / 4, Math.PI / 2, 2.1, Math.PI, -Math.PI / 3, 4.7, 6.0]

function cameraBasis(yaw: number) {
  const cam = new THREE.PerspectiveCamera()
  cam.rotation.set(0, yaw, 0, 'YXZ')
  cam.updateMatrixWorld(true)
  const forward = new THREE.Vector3()
  cam.getWorldDirection(forward)
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion)
  return { forward, right }
}

const holding =
  (...down: Action[]) =>
  (a: Action) =>
    down.includes(a)

describe('movementDelta', () => {
  it.each(YAWS)('W moves along the camera forward vector at yaw %f', (yaw) => {
    const { forward } = cameraBasis(yaw)
    const d = movementDelta(yaw, 0, 1)
    expect(d.x).toBeCloseTo(forward.x, 9)
    expect(d.z).toBeCloseTo(forward.z, 9)
  })

  it.each(YAWS)('S moves opposite the camera forward vector at yaw %f', (yaw) => {
    const { forward } = cameraBasis(yaw)
    const d = movementDelta(yaw, 0, -1)
    expect(d.x).toBeCloseTo(-forward.x, 9)
    expect(d.z).toBeCloseTo(-forward.z, 9)
  })

  it.each(YAWS)('D moves along the camera right vector at yaw %f', (yaw) => {
    const { right } = cameraBasis(yaw)
    const d = movementDelta(yaw, 1, 0)
    expect(d.x).toBeCloseTo(right.x, 9)
    expect(d.z).toBeCloseTo(right.z, 9)
  })

  it.each(YAWS)('A moves opposite the camera right vector at yaw %f', (yaw) => {
    const { right } = cameraBasis(yaw)
    const d = movementDelta(yaw, -1, 0)
    expect(d.x).toBeCloseTo(-right.x, 9)
    expect(d.z).toBeCloseTo(-right.z, 9)
  })

  it('preserves magnitude at every yaw, so turning never changes speed', () => {
    for (const yaw of YAWS) {
      const d = movementDelta(yaw, 0, 1)
      expect(Math.hypot(d.x, d.z)).toBeCloseTo(1, 9)
    }
  })

  it('keeps W perpendicular to D at every yaw', () => {
    for (const yaw of YAWS) {
      const f = movementDelta(yaw, 0, 1)
      const r = movementDelta(yaw, 1, 0)
      expect(f.x * r.x + f.z * r.z).toBeCloseTo(0, 9)
    }
  })

  it('is a rotation, not a reflection', () => {
    // The original bug negated only one axis, which mirrors the basis. A
    // mirrored basis still passes "W is perpendicular to D" and still has unit
    // length -- but the cross product flips sign, so this is the check that
    // actually catches it.
    for (const yaw of YAWS) {
      const f = movementDelta(yaw, 0, 1)
      const r = movementDelta(yaw, 1, 0)
      const cross = f.x * r.z - f.z * r.x
      expect(cross).toBeCloseTo(1, 9)
    }
  })

  it('is stationary with no keys held', () => {
    // toBeCloseTo rather than toEqual: x comes back as +0 and z as -0, which
    // toEqual treats as different values and gameplay does not.
    const d = movementDelta(1.23, 0, 0)
    expect(d.x).toBeCloseTo(0, 12)
    expect(d.z).toBeCloseTo(0, 12)
  })

  it('walks the full turn without W ever pointing backwards', () => {
    // Sweep a whole revolution and assert W always has a positive component
    // along the camera's forward direction. The original bug fails this at
    // every yaw.
    for (let deg = 0; deg < 360; deg += 7) {
      const yaw = (deg * Math.PI) / 180
      const { forward } = cameraBasis(yaw)
      const d = movementDelta(yaw, 0, 1)
      expect(d.x * forward.x + d.z * forward.z, `yaw ${deg}deg`).toBeGreaterThan(0.99)
    }
  })

  it('composes with moveVector so held keys map to the right world direction', () => {
    const yaw = 0.9
    const { forward, right } = cameraBasis(yaw)

    const w = moveVector(holding('forward'))
    const dW = movementDelta(yaw, w.x, w.z)
    expect(dW.x).toBeCloseTo(forward.x, 9)

    const d = moveVector(holding('right'))
    const dD = movementDelta(yaw, d.x, d.z)
    expect(dD.x).toBeCloseTo(right.x, 9)

    // Forward-right diagonal bisects the two, and stays unit length.
    const fr = moveVector(holding('forward', 'right'))
    const dFR = movementDelta(yaw, fr.x, fr.z)
    expect(Math.hypot(dFR.x, dFR.z)).toBeCloseTo(1, 9)
    expect(dFR.x).toBeCloseTo((forward.x + right.x) / Math.SQRT2, 6)
    expect(dFR.z).toBeCloseTo((forward.z + right.z) / Math.SQRT2, 6)
  })
})
