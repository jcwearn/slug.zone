/**
 * Ray-versus-enemy intersection.
 *
 * Enemies are treated as upright cylinders rather than boxes or spheres. A
 * sphere makes a tall creature impossible to hit in the legs and a short one
 * hittable above its head; a box needs an orientation nobody wants to maintain
 * for something that turns constantly. A cylinder is the shape a Doom-style
 * enemy actually behaves as, and it reduces to a 2D circle test plus a height
 * check.
 *
 * All pure, all in world units.
 */

export interface Cylinder {
  x: number
  z: number
  radius: number
  /** World Y of the base and top. */
  yMin: number
  yMax: number
}

/**
 * Distance along the ray to the cylinder, or null for a miss.
 *
 * Solves the 2D circle intersection in XZ, then checks the hit's height. The
 * ray direction must be normalised -- callers already have one from
 * aimDirection, and normalising here would hide a caller that forgot.
 */
export function rayCylinder(
  originX: number,
  originY: number,
  originZ: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  cyl: Cylinder,
  maxDistance: number,
): number | null {
  const ox = originX - cyl.x
  const oz = originZ - cyl.z

  // Quadratic in the XZ plane. `a` is zero for a perfectly vertical shot, and
  // dividing by it would produce NaN, so that case is handled separately.
  const a = dirX * dirX + dirZ * dirZ
  if (a < 1e-12) {
    // Straight up or down: inside the circle or nothing.
    if (ox * ox + oz * oz > cyl.radius * cyl.radius) return null
    if (dirY > 0) {
      const t = (cyl.yMin - originY) / dirY
      return t >= 0 && t <= maxDistance && originY + dirY * t <= cyl.yMax ? t : null
    }
    if (dirY < 0) {
      const t = (cyl.yMax - originY) / dirY
      return t >= 0 && t <= maxDistance && originY + dirY * t >= cyl.yMin ? t : null
    }
    return null
  }

  const b = 2 * (ox * dirX + oz * dirZ)
  const c = ox * ox + oz * oz - cyl.radius * cyl.radius
  const disc = b * b - 4 * a * c
  if (disc < 0) return null

  const root = Math.sqrt(disc)
  // Near root first. The far root matters only when the origin is inside the
  // cylinder, which happens when an enemy is pressed against the player.
  for (const t of [(-b - root) / (2 * a), (-b + root) / (2 * a)]) {
    if (t < 0 || t > maxDistance) continue
    const y = originY + dirY * t
    if (y >= cyl.yMin && y <= cyl.yMax) return t
  }
  return null
}

export interface HitCandidate<T> {
  target: T
  cylinder: Cylinder
}

export interface NearestHit<T> {
  target: T
  distance: number
}

/**
 * Nearest candidate along the ray, ignoring anything past `wallDistance`.
 *
 * The wall check is what stops shots killing things through walls -- the most
 * obvious possible bug in a hitscan weapon, and one that is invisible until
 * someone notices they are clearing rooms they have not entered.
 */
export function nearestHit<T>(
  originX: number,
  originY: number,
  originZ: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  candidates: Iterable<HitCandidate<T>>,
  wallDistance: number,
): NearestHit<T> | null {
  let best: NearestHit<T> | null = null
  for (const candidate of candidates) {
    const t = rayCylinder(
      originX,
      originY,
      originZ,
      dirX,
      dirY,
      dirZ,
      candidate.cylinder,
      wallDistance,
    )
    if (t === null) continue
    if (!best || t < best.distance) best = { target: candidate.target, distance: t }
  }
  return best
}

/**
 * Doom-style vertical aim assist.
 *
 * A Grub tops out at 1.4 world units and the player's eye sits at 2.2, so a
 * perfectly level shot sails over its head. Doom solved this by not letting the
 * player look up or down at all and auto-aiming everything. With free look the
 * equivalent is to keep the player's HORIZONTAL aim exactly as given -- so
 * shotgun spread and mouse precision still mean something -- and let only the
 * vertical component snap onto a target.
 *
 * The cone is a full 3D angle, not just horizontal, so deliberately aiming at
 * the ceiling does not still hit the slug by your feet. Inside the cone the
 * assist is total; outside it the player's aim is untouched.
 */
export function verticalAutoAim<T>(
  originX: number,
  originY: number,
  originZ: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  candidates: Iterable<HitCandidate<T>>,
  maxDistance: number,
  cone: number,
): { x: number; y: number; z: number } {
  const horizontal = Math.hypot(dirX, dirZ)
  if (horizontal < 1e-6) return { x: dirX, y: dirY, z: dirZ }

  let bestDistance = Infinity
  let bestSlope = 0
  let found = false

  for (const { cylinder } of candidates) {
    const dx = cylinder.x - originX
    const dz = cylinder.z - originZ
    const midY = (cylinder.yMin + cylinder.yMax) / 2
    const dy = midY - originY

    const flat = Math.hypot(dx, dz)
    const full = Math.hypot(dx, dy, dz)
    if (flat < 1e-6 || full < 1e-6 || flat > maxDistance) continue

    // Angle between the player's aim and the direction to this target.
    const dot = (dirX * dx + dirY * dy + dirZ * dz) / full
    if (dot < Math.cos(cone)) continue

    if (flat < bestDistance) {
      bestDistance = flat
      bestSlope = dy / flat
      found = true
    }
  }

  if (!found) return { x: dirX, y: dirY, z: dirZ }

  // Same horizontal heading, corrected elevation, renormalised.
  const hx = dirX / horizontal
  const hz = dirZ / horizontal
  const length = Math.hypot(1, bestSlope)
  return { x: hx / length, y: bestSlope / length, z: hz / length }
}
