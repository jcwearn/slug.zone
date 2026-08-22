/**
 * Where the player is actually pointing, in 3D.
 *
 * Kept separate from movement because the two use the same yaw but disagree
 * about pitch: movement deliberately ignores it (looking at the floor must not
 * slow you down), and aiming obviously must not.
 *
 * Like movementDelta, this is checked against three.js's own camera basis
 * rather than a second hand-derivation. The first version of the tracer code
 * negated the vertical term and sent salt downward when you aimed up -- a sign
 * error that a re-derived expectation would have reproduced rather than caught.
 */

export interface Vec3 {
  x: number
  y: number
  z: number
}

/**
 * Unit direction for `rotation.set(pitch, yaw, 0, 'YXZ')` on a camera that
 * looks down its own -Z:
 *
 *   x = -sin(yaw) * cos(pitch)
 *   y =  sin(pitch)
 *   z = -cos(yaw) * cos(pitch)
 *
 * Positive pitch is UP. That is the whole content of the bug this replaced.
 */
export function aimDirection(yaw: number, pitch: number): Vec3 {
  const cosPitch = Math.cos(pitch)
  return {
    x: -Math.sin(yaw) * cosPitch,
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * cosPitch,
  }
}

export interface ShotEnd {
  /** Distance travelled along the 3D direction, in world units. */
  distance: number
  /** What stopped it. */
  stoppedBy: 'wall' | 'floor' | 'ceiling' | 'range'
}

/**
 * How far a shot travels before something stops it.
 *
 * The wall raycast is 2D on the ground plane, so it returns a HORIZONTAL
 * distance. Converting that to a distance along a pitched ray is a divide by
 * cos(pitch) -- forgetting it makes shots fall short by more and more as you
 * look up or down, which reads as the gun being inaccurate rather than the
 * maths being wrong.
 *
 * Floor and ceiling are planes, so each is a single divide. Without them a
 * tracer aimed upward sails straight through the ceiling and keeps going,
 * which is very visible in a corridor.
 */
export function shotEndpoint(
  eyeY: number,
  dir: Vec3,
  horizontalWallDistance: number,
  maxRange: number,
  floorY: number,
  ceilingY: number,
): ShotEnd {
  // The eye must be inside the room. This is not defensive noise: X and Z are
  // in world units (grid * cellSize) while Y is not, and mixing the two put the
  // muzzle at 8.8 in a room 4 tall -- every tracer spawned above the ceiling and
  // nothing was visible. A unit mismatch shows up here first and nowhere else.
  if (eyeY < floorY || eyeY > ceilingY) {
    throw new RangeError(
      `eye at ${eyeY} is outside the room (${floorY}..${ceilingY}) -- check world vs grid units`,
    )
  }

  const cosPitch = Math.hypot(dir.x, dir.z)

  // Looking straight up or down: there is no horizontal component, so the wall
  // distance is meaningless and only the floor/ceiling planes apply.
  let distance = maxRange
  let stoppedBy: ShotEnd['stoppedBy'] = 'range'

  if (cosPitch > 1e-6) {
    const toWall = horizontalWallDistance / cosPitch
    if (toWall < distance) {
      distance = toWall
      stoppedBy = 'wall'
    }
  }

  if (dir.y > 1e-6) {
    const toCeiling = (ceilingY - eyeY) / dir.y
    if (toCeiling >= 0 && toCeiling < distance) {
      distance = toCeiling
      stoppedBy = 'ceiling'
    }
  } else if (dir.y < -1e-6) {
    const toFloor = (floorY - eyeY) / dir.y
    if (toFloor >= 0 && toFloor < distance) {
      distance = toFloor
      stoppedBy = 'floor'
    }
  }

  return { distance: Math.max(0, distance), stoppedBy }
}
